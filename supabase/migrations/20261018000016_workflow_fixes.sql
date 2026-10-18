-- =============================================================================
-- Workflow fixes, part 2 (audit items 44, 48, 51-65): sign-in limits that
-- count failures only, unfinished submissions, revisions with a response to
-- the reviewers, withdrawal by the author, status transition rules, review
-- rounds, closing reviews on a decision, publication of linked articles,
-- confidential comments and accept/decline for reviewers, revision due dates
-- and reminders, reminder bookkeeping that doesn't bump versions, and file
-- versions that can't collide.
--
-- The new enum values from 20261018000015 are only ever compared inside
-- PL/pgSQL bodies (checked when called, not when created) or as text, so this
-- file also works when both run in one transaction (the production setup
-- script).
-- Reversal: supabase/rollbacks/20261018000016_workflow_fixes.down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rate limits (item 44): read a bucket without counting a hit, so sign-in
--    can check before trying and count only failures.
-- ---------------------------------------------------------------------------
create or replace function public.peek_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  win_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits int;
begin
  select case when rl.window_start = win_start then rl.hits else 0 end into current_hits
  from public.rate_limits rl where rl.key = p_key;
  current_hits := coalesce(current_hits, 0);
  allowed := current_hits < p_limit;
  remaining := greatest(p_limit - current_hits, 0);
  retry_after_seconds := case when allowed then 0
    else ceil(extract(epoch from (win_start + make_interval(secs => p_window_seconds) - now())))::int end;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. New columns.
-- ---------------------------------------------------------------------------
alter table public.submissions
  -- Set once the original Word manuscript is in and the author finished
  -- submitting (item 51). Null = "not finished": hidden from the editors' queue.
  add column if not exists finalised_at timestamptz,
  -- Review round (item 58): a revised manuscript sent back to review starts a new one.
  add column if not exists review_round int not null default 1 check (review_round between 1 and 50),
  -- Revision due date and overdue reminders to the author (item 54).
  add column if not exists revision_due_date date,
  add column if not exists revision_reminder_sent_at timestamptz;

alter table public.review_assignments
  add column if not exists round int not null default 1 check (round between 1 and 50),
  -- For the editors only: never shown to the author (item 60).
  add column if not exists confidential_comments text check (char_length(confidential_comments) <= 100000),
  -- The reviewer's answer to the invitation (item 60). Declining also withdraws the assignment.
  add column if not exists response text check (response in ('accepted', 'declined')),
  add column if not exists responded_at timestamptz,
  add column if not exists decline_reason text check (char_length(decline_reason) <= 2000),
  -- When an editor shared the comments with the author, anonymously (item 52).
  add column if not exists shared_with_author_at timestamptz;

-- The author's response to the reviewers, stored with the revised file (item 52).
alter table public.submission_files
  add column if not exists author_response text check (char_length(author_response) <= 20000);

comment on column public.review_assignments.confidential_comments is
  'Comments for the editors only. Authors have no read access to review_assignments; never copy this column anywhere they can see.';

-- Submissions that were announced, have their Word manuscript, or are already
-- with the editors count as finished.
update public.submissions s
set finalised_at = coalesce(
  (select min(e.created_at) from public.domain_events e
   where e.event_type = 'submission.created' and e.aggregate_id = s.id::text),
  s.created_at)
where s.finalised_at is null
  and (s.status::text <> 'submitted'
       or exists (select 1 from public.domain_events e
                  where e.event_type = 'submission.created' and e.aggregate_id = s.id::text)
       or exists (select 1 from public.submission_files f
                  where f.submission_id = s.id and f.kind = 'original'
                    and lower(f.original_name) like '%.docx'));

create index if not exists submissions_unfinished_idx on public.submissions (created_at)
  where finalised_at is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Reminder bookkeeping no longer bumps version or updated_at (item 61), so
--    a reviewer or author with a form open doesn't get a false conflict.
-- ---------------------------------------------------------------------------
drop trigger if exists review_assignments_updated_at on public.review_assignments;
create trigger review_assignments_updated_at before update on public.review_assignments
  for each row execute function public.set_updated_at('reminder_sent_at');
drop trigger if exists review_assignments_version on public.review_assignments;
create trigger review_assignments_version before update on public.review_assignments
  for each row execute function public.bump_version('reminder_sent_at');

drop trigger if exists submissions_updated_at on public.submissions;
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at('revision_reminder_sent_at');
drop trigger if exists submissions_version on public.submissions;
create trigger submissions_version before update on public.submissions
  for each row execute function public.bump_version('revision_reminder_sent_at');

-- ---------------------------------------------------------------------------
-- 4. Review rounds (item 58): one assignment per reviewer per round, so a
--    revised manuscript can go back to the same reviewer.
-- ---------------------------------------------------------------------------
alter table public.review_assignments drop constraint if exists review_assignments_submission_id_reviewer_id_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'review_assignments_submission_reviewer_round_key') then
    alter table public.review_assignments
      add constraint review_assignments_submission_reviewer_round_key unique (submission_id, reviewer_id, round);
  end if;
end;
$$;

-- New assignments always belong to the submission's current round.
create or replace function public.set_review_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.review_round into new.round from public.submissions s where s.id = new.submission_id;
  new.round := coalesce(new.round, 1);
  return new;
end;
$$;
drop trigger if exists review_assignments_round on public.review_assignments;
create trigger review_assignments_round before insert on public.review_assignments
  for each row execute function public.set_review_round();

-- ---------------------------------------------------------------------------
-- 5. File versions (item 65): computed in the database under a lock, and
--    unique, so two uploads at once can't both become "version 2".
-- ---------------------------------------------------------------------------
with clashes as (
  select submission_id, kind from public.submission_files
  group by submission_id, kind, version having count(*) > 1
), renumbered as (
  select f.id, row_number() over (partition by f.submission_id, f.kind order by f.created_at, f.id) as v
  from public.submission_files f
  join (select distinct submission_id, kind from clashes) c using (submission_id, kind)
)
update public.submission_files f set version = r.v
from renumbered r where r.id = f.id and f.version <> r.v;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submission_files_submission_kind_version_key') then
    alter table public.submission_files
      add constraint submission_files_submission_kind_version_key unique (submission_id, kind, version);
  end if;
end;
$$;

create or replace function public.next_submission_file_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('awlel:submission_files:' || new.submission_id::text || ':' || new.kind::text));
  select coalesce(max(f.version), 0) + 1 into new.version
  from public.submission_files f
  where f.submission_id = new.submission_id and f.kind = new.kind;
  return new;
end;
$$;
drop trigger if exists submission_files_version on public.submission_files;
create trigger submission_files_version before insert on public.submission_files
  for each row execute function public.next_submission_file_version();

-- ---------------------------------------------------------------------------
-- 6. Status transitions (item 56). Withdrawn and published are final; a
--    rejected manuscript can only be reopened for review, with a message.
--    The app shows only these choices; the guard enforces them for everyone.
-- ---------------------------------------------------------------------------
create or replace function public.submission_transition_allowed(p_from public.submission_status, p_to public.submission_status)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return case p_from::text
    when 'submitted' then p_to::text in ('under_screening', 'under_review', 'rejected', 'withdrawn')
    when 'under_screening' then p_to::text in ('under_review', 'revisions_requested', 'rejected', 'withdrawn')
    when 'under_review' then p_to::text in ('revisions_requested', 'accepted', 'rejected', 'withdrawn')
    when 'revisions_requested' then p_to::text in ('revision_received', 'under_review', 'rejected', 'withdrawn')
    when 'revision_received' then p_to::text in ('under_review', 'revisions_requested', 'accepted', 'rejected', 'withdrawn')
    when 'accepted' then p_to::text in ('published', 'withdrawn')
    when 'rejected' then p_to::text = 'under_review'
    else false
  end;
end;
$$;

-- Trusted changes made by the workflow functions below (recording a
-- revision, withdrawing, finalising, publishing) set the transaction-local
-- awlel.system_change flag; nothing a client sends can set it.
create or replace function public.guard_submission_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (auth.uid() is null or public.is_staff() or coalesce(current_setting('awlel.system_change', true), '') = 'on')
     and (new.status is distinct from old.status
          or new.author_id is distinct from old.author_id
          or new.article_id is distinct from old.article_id
          or new.idempotency_key is distinct from old.idempotency_key
          or new.deleted_at is distinct from old.deleted_at
          or new.finalised_at is distinct from old.finalised_at
          or new.review_round is distinct from old.review_round
          or new.revision_due_date is distinct from old.revision_due_date
          or new.revision_reminder_sent_at is distinct from old.revision_reminder_sent_at) then
    raise exception 'Not allowed to change these submission fields' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not public.submission_transition_allowed(old.status, new.status) then
      raise exception 'A submission can''t move from "%" to "%".', old.status, new.status using errcode = 'AW422';
    end if;
    if new.status::text = 'published' and new.article_id is null then
      raise exception 'Create the article before marking the submission as published.' using errcode = 'AW422';
    end if;
    -- A revised manuscript sent back to review starts a new round, so the
    -- same reviewers can be invited again (item 58).
    if new.status::text = 'under_review' and old.status::text in ('revisions_requested', 'revision_received')
       and exists (select 1 from public.review_assignments r
                   where r.submission_id = new.id and r.round = old.review_round) then
      new.review_round := old.review_round + 1;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reviewers (items 60, 64): confidential comments, accept or decline. A
--    reviewer may decline (which withdraws the assignment) but not withdraw
--    otherwise, and can't touch bookkeeping columns.
-- ---------------------------------------------------------------------------
create or replace function public.guard_review_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_staff() or coalesce(current_setting('awlel.system_change', true), '') = 'on' then
    if new.response is distinct from old.response then
      new.responded_at := case when new.response is null then null else now() end;
    end if;
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'This review has already been submitted or closed' using errcode = '42501';
  end if;
  if new.submission_id is distinct from old.submission_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.assigned_by is distinct from old.assigned_by
     or new.due_date is distinct from old.due_date
     or new.reminder_sent_at is distinct from old.reminder_sent_at
     or new.round is distinct from old.round
     or new.shared_with_author_at is distinct from old.shared_with_author_at
     or (new.response is null and old.response is not null)
     or (new.status = 'withdrawn' and new.response is distinct from 'declined')
     or (new.response = 'declined' and new.status <> 'withdrawn') then
    raise exception 'Reviewers may only edit their own review' using errcode = '42501';
  end if;
  if new.annotated_file_id is distinct from old.annotated_file_id and new.annotated_file_id is not null
     and not exists (select 1 from public.submission_files f
                     where f.id = new.annotated_file_id and f.submission_id = new.submission_id
                       and f.kind = 'reviewer_annotated' and f.uploaded_by = auth.uid()) then
    raise exception 'That file is not your annotated manuscript' using errcode = '42501';
  end if;
  -- Submitting a review means the invitation was accepted.
  if new.status = 'submitted' then
    new.submitted_at := now();
    new.response := coalesce(new.response, 'accepted');
  end if;
  new.responded_at := case when new.response is distinct from old.response then now() else old.responded_at end;
  if new.response is distinct from 'declined' then
    new.decline_reason := old.decline_reason;
  end if;
  return new;
end;
$$;

-- The reviewer's queue, now with the round, their answer to the invitation
-- and their confidential comments (their own; still nothing about the author).
drop function if exists public.reviewer_queue();
create function public.reviewer_queue()
returns table (
  assignment_id uuid,
  assignment_status public.review_status,
  due_date date,
  recommendation public.review_recommendation,
  comments text,
  confidential_comments text,
  submitted_at timestamptz,
  assignment_version int,
  assigned_at timestamptz,
  round int,
  response text,
  submission_id uuid,
  title text,
  abstract text,
  keywords text[],
  category_name text,
  citation_style public.citation_style
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.due_date, r.recommendation, r.comments, r.confidential_comments, r.submitted_at,
         r.version, r.created_at, r.round, r.response,
         s.id, s.title, s.abstract, s.keywords, c.name, s.citation_style
  from public.review_assignments r
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  left join public.categories c on c.id = s.category_id
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn'
  order by (r.status = 'pending') desc, r.due_date nulls last, r.created_at desc
$$;

-- Manuscript files for reviewers, now saying which is the PDF copy so it
-- can be labelled as such (item 64). Still no names, paths or uploader.
drop function if exists public.reviewer_files();
create function public.reviewer_files()
returns table (file_id uuid, submission_id uuid, kind public.submission_file_kind, version int,
               created_at timestamptz, is_pdf boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (f.id) f.id, f.submission_id, f.kind, f.version, f.created_at,
         f.mime_type = 'application/pdf'
  from public.submission_files f
  join public.review_assignments r on r.submission_id = f.submission_id
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn' and f.kind in ('original', 'revision')
  order by f.id, f.created_at
$$;

-- ---------------------------------------------------------------------------
-- 8. Status changes (items 54, 56, 59).
-- ---------------------------------------------------------------------------
drop function if exists public.change_submission_status(uuid, int, public.submission_status, text, boolean);
create or replace function public.change_submission_status(
  p_submission_id uuid,
  p_expected_version int,
  p_status public.submission_status,
  p_message text default null,
  p_visible_to_author boolean default true,
  p_revision_due_date date default null
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_old public.submission_status;
  v_version int;
begin
  select s.status into v_old from public.submissions s where s.id = p_submission_id;
  if v_old = p_status then
    raise exception 'The submission already has this status.' using errcode = 'AW422';
  end if;
  if v_old::text = 'rejected' and coalesce(btrim(p_message), '') = '' then
    raise exception 'Add a message explaining why the manuscript is being reopened.' using errcode = 'AW422';
  end if;
  perform set_config('awlel.status_message', coalesce(p_message, ''), true);
  perform set_config('awlel.status_message_visible', p_visible_to_author::text, true);
  update public.submissions s set
    status = p_status,
    revision_due_date = case when p_status::text = 'revisions_requested'
                             then coalesce(p_revision_due_date, (now() at time zone 'utc')::date + 28)
                             else s.revision_due_date end,
    revision_reminder_sent_at = case when p_status::text = 'revisions_requested' then null
                                     else s.revision_reminder_sent_at end
  where s.id = p_submission_id and s.version = p_expected_version and s.deleted_at is null
  returning s.version into v_version;
  if not found then
    raise exception 'This submission was changed by someone else.' using errcode = 'AW409';
  end if;
  perform set_config('awlel.status_message', '', true);
  return v_version;
end;
$$;

-- A decision closes the reviews still outstanding (item 59). The app emails
-- those reviewers; this makes sure no path leaves them open.
create or replace function public.close_pending_reviews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := current_setting('awlel.system_change', true);
begin
  if new.status::text in ('accepted', 'rejected', 'published', 'withdrawn') then
    perform set_config('awlel.system_change', 'on', true);
    update public.review_assignments set status = 'withdrawn'
    where submission_id = new.id and status = 'pending';
    perform set_config('awlel.system_change', coalesce(v_prev, ''), true);
  end if;
  return null;
end;
$$;
drop trigger if exists submissions_close_reviews on public.submissions;
create trigger submissions_close_reviews after update of status on public.submissions
  for each row when (new.status is distinct from old.status)
  execute function public.close_pending_reviews();

-- Timeline note without a status change (item 55). Returns the new event's
-- id, which the app uses as the email's idempotency key.
drop function if exists public.add_submission_note(uuid, text, boolean);
create function public.add_submission_note(p_submission_id uuid, p_message text, p_visible_to_author boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.submission_status;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'Write the note first.' using errcode = 'AW422';
  end if;
  select s.status into v_status from public.submissions s where s.id = p_submission_id;
  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (p_submission_id, auth.uid(), v_status, v_status, left(p_message, 20000), p_visible_to_author)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Authors (items 51, 52, 53).
-- ---------------------------------------------------------------------------

-- Finishing a submission: needs the original Word manuscript (checked by
-- kind and extension or type, case-insensitively). True the first time only,
-- so the confirmation emails go out once.
create or replace function public.finalize_submission(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
  v_rows int;
  v_prev text := current_setting('awlel.system_change', true);
begin
  select * into s from public.submissions where id = p_submission_id and deleted_at is null;
  if not found or (s.author_id is distinct from auth.uid() and not public.is_staff()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if s.finalised_at is not null then
    return false;
  end if;
  if not exists (select 1 from public.submission_files f
                 where f.submission_id = s.id and f.kind = 'original'
                   and (lower(f.original_name) like '%.docx'
                        or f.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then
    raise exception 'Please upload your manuscript as a Word document (.docx).' using errcode = 'AW422';
  end if;
  perform set_config('awlel.system_change', 'on', true);
  update public.submissions set finalised_at = now() where id = s.id and finalised_at is null;
  get diagnostics v_rows = row_count;
  perform set_config('awlel.system_change', coalesce(v_prev, ''), true);
  return v_rows = 1;
end;
$$;

-- Recording a revised manuscript: stores the author's response to the
-- reviewers with the file and moves the submission to "Revision received".
-- Once per file: repeating the call records nothing new.
drop function if exists public.record_revision(uuid);
create function public.record_revision(p_file_id uuid, p_response text default null)
returns table (submission_id uuid, title text, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.submission_files;
  s public.submissions;
  v_message text;
  v_prev text := current_setting('awlel.system_change', true);
begin
  select * into f from public.submission_files where id = p_file_id;
  if not found or f.kind <> 'revision' or f.uploaded_by is distinct from auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from public.submissions where id = f.submission_id;
  if s.author_id is distinct from auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_message := format('Revised manuscript (version %s) uploaded by the author.', f.version);
  if exists (select 1 from public.submission_events e where e.submission_id = s.id and e.message = v_message) then
    return query select s.id, s.title, false;
    return;
  end if;
  if s.status::text <> 'revisions_requested' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.submission_files set author_response = nullif(btrim(left(p_response, 20000)), '')
  where id = f.id;
  perform set_config('awlel.status_message', v_message, true);
  perform set_config('awlel.status_message_visible', 'true', true);
  perform set_config('awlel.system_change', 'on', true);
  update public.submissions set status = 'revision_received' where id = s.id;
  perform set_config('awlel.system_change', coalesce(v_prev, ''), true);
  perform set_config('awlel.status_message', '', true);
  return query select s.id, s.title, true;
end;
$$;

-- Withdrawal by the author (item 53), before a decision. Final.
create or replace function public.withdraw_submission(p_submission_id uuid, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
  v_version int;
  v_prev text := current_setting('awlel.system_change', true);
begin
  select * into s from public.submissions where id = p_submission_id and deleted_at is null;
  if not found or s.author_id is distinct from auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if s.status::text not in ('submitted', 'under_screening', 'under_review', 'revisions_requested', 'revision_received') then
    raise exception 'This manuscript can no longer be withdrawn here. Please contact the editors.' using errcode = 'AW422';
  end if;
  perform set_config('awlel.status_message',
    'Withdrawn by the author.' || coalesce(E'\n\nReason: ' || nullif(btrim(left(p_reason, 2000)), ''), ''), true);
  perform set_config('awlel.status_message_visible', 'true', true);
  perform set_config('awlel.system_change', 'on', true);
  update public.submissions set status = 'withdrawn' where id = s.id returning version into v_version;
  perform set_config('awlel.system_change', coalesce(v_prev, ''), true);
  perform set_config('awlel.status_message', '', true);
  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Publication (item 57): when an article made from a submission is
--     published in a published issue, the submission becomes "Published"
--     and a submission.published event is recorded; the app emails the
--     author once from that event.
-- ---------------------------------------------------------------------------
create or replace function public.sync_published_submissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_prev text := current_setting('awlel.system_change', true);
begin
  for r in
    select s.id as submission_id, a.id as article_id
    from public.articles a
    join public.issues i on i.id = a.issue_id and i.status = 'published' and i.deleted_at is null
    join public.submissions s on s.id = a.submission_id and s.deleted_at is null
    where a.status = 'published' and a.deleted_at is null
      and s.status = 'accepted'
      and (s.article_id is null or s.article_id = a.id)
      and case when tg_table_name = 'articles' then a.id = new.id else a.issue_id = new.id end
  loop
    perform set_config('awlel.system_change', 'on', true);
    perform set_config('awlel.status_message', 'Your article has been published.', true);
    perform set_config('awlel.status_message_visible', 'true', true);
    update public.submissions set status = 'published', article_id = r.article_id where id = r.submission_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, actor_id, payload)
    values ('submission.published', 'submission', r.submission_id::text,
            (select p.id from public.profiles p where p.id = auth.uid()),
            jsonb_build_object('articleId', r.article_id));
  end loop;
  perform set_config('awlel.system_change', coalesce(v_prev, ''), true);
  perform set_config('awlel.status_message', '', true);
  return null;
end;
$$;
drop trigger if exists articles_publish_submission on public.articles;
create trigger articles_publish_submission after insert or update of status, issue_id, submission_id on public.articles
  for each row when (new.status = 'published' and new.submission_id is not null)
  execute function public.sync_published_submissions();
drop trigger if exists issues_publish_submissions on public.issues;
create trigger issues_publish_submissions after update of status on public.issues
  for each row when (new.status = 'published' and old.status is distinct from new.status)
  execute function public.sync_published_submissions();

-- ---------------------------------------------------------------------------
-- 11. Reminders (items 54, 59): reviews of closed submissions are never
--     chased; authors are reminded of an overdue revision at most weekly.
-- ---------------------------------------------------------------------------
create or replace function public.due_review_reminders()
returns table (assignment_id uuid, reviewer_email text, reviewer_name text, due_date date, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.email::text, p.full_name, r.due_date, s.title
  from public.review_assignments r
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  where r.status = 'pending'
    and s.status::text not in ('accepted', 'rejected', 'published', 'withdrawn')
    and r.due_date is not null
    and r.due_date <= (now() at time zone 'utc')::date + 3
    and (r.reminder_sent_at is null or r.reminder_sent_at < now() - interval '3 days')
  order by r.due_date
  limit 200
$$;

create or replace function public.due_revision_reminders()
returns table (submission_id uuid, author_email text, author_name text, due_date date, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.email::text, p.full_name, s.revision_due_date, s.title
  from public.submissions s
  join public.profiles p on p.id = s.author_id and p.is_active
  where s.status = 'revisions_requested'
    and s.deleted_at is null
    and s.revision_due_date is not null
    and s.revision_due_date < (now() at time zone 'utc')::date
    and (s.revision_reminder_sent_at is null or s.revision_reminder_sent_at < now() - interval '7 days')
  order by s.revision_due_date
  limit 200
$$;

-- ---------------------------------------------------------------------------
-- 12. Grants.
-- ---------------------------------------------------------------------------
revoke execute on function public.peek_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.peek_rate_limit(text, int, int) to service_role;
revoke execute on function public.due_revision_reminders() from public, anon, authenticated;
grant execute on function public.due_revision_reminders() to service_role;
revoke execute on function public.due_review_reminders() from public, anon, authenticated;
grant execute on function public.due_review_reminders() to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'reviewer_queue()', 'reviewer_files()',
    'change_submission_status(uuid, int, public.submission_status, text, boolean, date)',
    'add_submission_note(uuid, text, boolean)', 'finalize_submission(uuid)',
    'record_revision(uuid, text)', 'withdraw_submission(uuid, text)',
    'submission_transition_allowed(public.submission_status, public.submission_status)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

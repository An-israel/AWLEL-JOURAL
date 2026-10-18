-- Reverses 20261018000016_workflow_fixes.sql. Drops review rounds (keeping
-- each reviewer's latest round), confidential comments, invitation replies,
-- authors' responses to reviewers and revision due dates.

-- Publication sync, reminders, author functions.
drop trigger if exists issues_publish_submissions on public.issues;
drop trigger if exists articles_publish_submission on public.articles;
drop function if exists public.sync_published_submissions();
drop function if exists public.due_revision_reminders();
drop function if exists public.withdraw_submission(uuid, text);
drop function if exists public.finalize_submission(uuid);
drop function if exists public.peek_rate_limit(text, int, int);

drop function if exists public.record_revision(uuid, text);
create function public.record_revision(p_file_id uuid)
returns table (submission_id uuid, title text, recorded boolean)
language plpgsql security definer set search_path = '' as $$
declare
  f public.submission_files;
  s public.submissions;
  v_message text;
begin
  select * into f from public.submission_files where id = p_file_id;
  if not found or f.kind <> 'revision' or f.uploaded_by is distinct from auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from public.submissions where id = f.submission_id;
  if s.author_id is distinct from auth.uid() or s.status <> 'revisions_requested' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_message := format('Revised manuscript (version %s) uploaded by the author.', f.version);
  if exists (select 1 from public.submission_events e where e.submission_id = s.id and e.message = v_message) then
    return query select s.id, s.title, false;
    return;
  end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (s.id, auth.uid(), s.status, s.status, v_message, true);
  return query select s.id, s.title, true;
end; $$;
revoke execute on function public.record_revision(uuid) from public, anon;
grant execute on function public.record_revision(uuid) to authenticated;

drop function if exists public.add_submission_note(uuid, text, boolean);
create function public.add_submission_note(p_submission_id uuid, p_message text, p_visible_to_author boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.submission_status;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select s.status into v_status from public.submissions s where s.id = p_submission_id;
  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (p_submission_id, auth.uid(), v_status, v_status, left(p_message, 2000), p_visible_to_author);
end; $$;
revoke execute on function public.add_submission_note(uuid, text, boolean) from public, anon;
grant execute on function public.add_submission_note(uuid, text, boolean) to authenticated;

drop trigger if exists submissions_close_reviews on public.submissions;
drop function if exists public.close_pending_reviews();

drop function if exists public.change_submission_status(uuid, int, public.submission_status, text, boolean, date);
create function public.change_submission_status(
  p_submission_id uuid, p_expected_version int, p_status public.submission_status,
  p_message text default null, p_visible_to_author boolean default true)
returns int language plpgsql set search_path = '' as $$
declare
  v_version int;
begin
  perform set_config('awlel.status_message', coalesce(p_message, ''), true);
  perform set_config('awlel.status_message_visible', p_visible_to_author::text, true);
  update public.submissions s set status = p_status
  where s.id = p_submission_id and s.version = p_expected_version and s.deleted_at is null
  returning s.version into v_version;
  if not found then
    raise exception 'This submission was changed by someone else.' using errcode = 'AW409';
  end if;
  return v_version;
end; $$;
revoke execute on function public.change_submission_status(uuid, int, public.submission_status, text, boolean) from public, anon;
grant execute on function public.change_submission_status(uuid, int, public.submission_status, text, boolean) to authenticated;

create or replace function public.due_review_reminders()
returns table (assignment_id uuid, reviewer_email text, reviewer_name text, due_date date, title text)
language sql stable security definer set search_path = '' as $$
  select r.id, p.email, p.full_name, r.due_date, s.title
  from public.review_assignments r
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  where r.status = 'pending'
    and r.due_date is not null
    and r.due_date <= (now() at time zone 'utc')::date + 3
    and (r.reminder_sent_at is null or r.reminder_sent_at < now() - interval '3 days')
  order by r.due_date
  limit 200
$$;
revoke execute on function public.due_review_reminders() from public, anon, authenticated;
grant execute on function public.due_review_reminders() to service_role;

-- Reviewer functions as they were (milestone 6 and 9).
drop function if exists public.reviewer_files();
create function public.reviewer_files()
returns table (file_id uuid, submission_id uuid, kind public.submission_file_kind, version int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.id, f.submission_id, f.kind, f.version, f.created_at
  from public.submission_files f
  join public.review_assignments r on r.submission_id = f.submission_id
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn' and f.kind in ('original', 'revision')
  order by f.created_at
$$;
revoke execute on function public.reviewer_files() from public, anon;
grant execute on function public.reviewer_files() to authenticated;

drop function if exists public.reviewer_queue();
create function public.reviewer_queue()
returns table (
  assignment_id uuid, assignment_status public.review_status, due_date date,
  recommendation public.review_recommendation, comments text, submitted_at timestamptz,
  assignment_version int, assigned_at timestamptz, submission_id uuid, title text, abstract text,
  keywords text[], category_name text, citation_style public.citation_style)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.due_date, r.recommendation, r.comments, r.submitted_at, r.version, r.created_at,
         s.id, s.title, s.abstract, s.keywords, c.name, s.citation_style
  from public.review_assignments r
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  left join public.categories c on c.id = s.category_id
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn'
  order by (r.status = 'pending') desc, r.due_date nulls last, r.created_at desc
$$;
revoke execute on function public.reviewer_queue() from public, anon;
grant execute on function public.reviewer_queue() to authenticated;

-- Guards as they were (milestones 6 and 9).
create or replace function public.guard_review_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'This review has already been submitted' using errcode = '42501';
  end if;
  if new.submission_id is distinct from old.submission_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.assigned_by is distinct from old.assigned_by
     or new.due_date is distinct from old.due_date
     or new.reminder_sent_at is distinct from old.reminder_sent_at
     or new.status not in ('pending', 'submitted') then
    raise exception 'Reviewers may only edit their own review' using errcode = '42501';
  end if;
  if new.annotated_file_id is distinct from old.annotated_file_id and new.annotated_file_id is not null
     and not exists (select 1 from public.submission_files f
                     where f.id = new.annotated_file_id and f.submission_id = new.submission_id
                       and f.kind = 'reviewer_annotated' and f.uploaded_by = auth.uid()) then
    raise exception 'That file is not your annotated manuscript' using errcode = '42501';
  end if;
  if new.status = 'submitted' then
    new.submitted_at := now();
  end if;
  return new;
end; $$;

create or replace function public.guard_submission_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.author_id is distinct from old.author_id
     or new.article_id is distinct from old.article_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Not allowed to change these submission fields' using errcode = '42501';
  end if;
  return new;
end; $$;
drop function if exists public.submission_transition_allowed(public.submission_status, public.submission_status);

-- File versions.
drop trigger if exists submission_files_version on public.submission_files;
drop function if exists public.next_submission_file_version();
alter table public.submission_files drop constraint if exists submission_files_submission_kind_version_key;

-- Review rounds: one assignment per reviewer again (the latest round's).
drop trigger if exists review_assignments_round on public.review_assignments;
drop function if exists public.set_review_round();
alter table public.review_assignments drop constraint if exists review_assignments_submission_reviewer_round_key;
delete from public.review_assignments r
using public.review_assignments later
where later.submission_id = r.submission_id and later.reviewer_id = r.reviewer_id and later.round > r.round;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'review_assignments_submission_id_reviewer_id_key') then
    alter table public.review_assignments
      add constraint review_assignments_submission_id_reviewer_id_key unique (submission_id, reviewer_id);
  end if;
end;
$$;

-- Version and timestamp triggers without exclusions.
drop trigger if exists submissions_version on public.submissions;
create trigger submissions_version before update on public.submissions
  for each row execute function public.bump_version();
drop trigger if exists submissions_updated_at on public.submissions;
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
drop trigger if exists review_assignments_version on public.review_assignments;
create trigger review_assignments_version before update on public.review_assignments
  for each row execute function public.bump_version();
drop trigger if exists review_assignments_updated_at on public.review_assignments;
create trigger review_assignments_updated_at before update on public.review_assignments
  for each row execute function public.set_updated_at();

-- Columns.
drop index if exists public.submissions_unfinished_idx;
alter table public.submission_files drop column if exists author_response;
alter table public.review_assignments
  drop column if exists shared_with_author_at,
  drop column if exists decline_reason,
  drop column if exists responded_at,
  drop column if exists response,
  drop column if exists confidential_comments,
  drop column if exists round;
alter table public.submissions
  drop column if exists revision_reminder_sent_at,
  drop column if exists revision_due_date,
  drop column if exists review_round,
  drop column if exists finalised_at;

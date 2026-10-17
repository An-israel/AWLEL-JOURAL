-- =============================================================================
-- Security review fixes (milestone 9).
-- Reversal: supabase/rollbacks/20261017000011_security_hardening.down.sql
-- =============================================================================

-- 1. Blind review: reviewers no longer read submission_files rows, which
--    carry the original file name, the storage path and the uploader. They
--    see only rows they uploaded themselves (needed when attaching an
--    annotated file); manuscripts reach them through the server, which hands
--    out short-lived links under neutral names.
drop policy if exists "submission_files: reviewer read assigned" on public.submission_files;
create policy "submission_files: reviewer read own uploads" on public.submission_files for select to authenticated
  using (uploaded_by = (select auth.uid()) and kind = 'reviewer_annotated'
         and public.is_assigned_reviewer(submission_id));

-- The manuscript files a reviewer may open, with nothing that could identify
-- the author: no names, paths or uploader. Only for active assignments.
create or replace function public.reviewer_files()
returns table (file_id uuid, submission_id uuid, kind public.submission_file_kind, version int, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.submission_id, f.kind, f.version, f.created_at
  from public.submission_files f
  join public.review_assignments r on r.submission_id = f.submission_id
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn' and f.kind in ('original', 'revision')
  order by f.created_at
$$;
revoke execute on function public.reviewer_files() from public, anon;
grant execute on function public.reviewer_files() to authenticated;

-- 2. Nobody but staff reads or writes the submissions bucket directly. Every
--    upload and download goes through server-issued signed URLs after the
--    server's own permission check, so these policies were never needed and
--    let reviewers list other files (including other reviewers' uploads).
drop policy if exists "submissions: author read own" on storage.objects;
drop policy if exists "submissions: reviewer read assigned" on storage.objects;
drop policy if exists "submissions: author upload own" on storage.objects;
drop policy if exists "submissions: reviewer upload annotated" on storage.objects;

-- 3. Timeline notes are written by staff only. Authors record a revision with
--    record_revision(), which checks the file is theirs, revisions were
--    requested, and writes a fixed message once per file.
create or replace function public.add_submission_note(p_submission_id uuid, p_message text, p_visible_to_author boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

create or replace function public.record_revision(p_file_id uuid)
returns table (submission_id uuid, title text, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
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
  -- Once per file: repeating the call records nothing new.
  if exists (select 1 from public.submission_events e where e.submission_id = s.id and e.message = v_message) then
    return query select s.id, s.title, false;
    return;
  end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (s.id, auth.uid(), s.status, s.status, v_message, true);
  return query select s.id, s.title, true;
end;
$$;
revoke execute on function public.record_revision(uuid) from public, anon;
grant execute on function public.record_revision(uuid) to authenticated;

-- 4. A reviewer can only attach an annotated file they uploaded to the same
--    submission, and can't change bookkeeping columns.
create or replace function public.guard_review_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

-- 5. The schema version is for staff, not the public.
revoke execute on function public.schema_version() from public, anon;
grant execute on function public.schema_version() to authenticated, service_role;

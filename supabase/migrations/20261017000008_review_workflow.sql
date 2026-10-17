-- =============================================================================
-- Submission and review workflow helpers (section 7).
-- Reversal: supabase/rollbacks/20261017000008_review_workflow.down.sql
-- =============================================================================

-- Status change + optional message to the author, in one transaction. The
-- history row is written by the log_submission_status trigger, which reads
-- the message from these transaction-local settings.
create or replace function public.change_submission_status(
  p_submission_id uuid,
  p_expected_version int,
  p_status public.submission_status,
  p_message text default null,
  p_visible_to_author boolean default true
)
returns int
language plpgsql
set search_path = ''
as $$
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
end;
$$;

-- A note on the timeline without a status change (e.g. "revised file received").
create or replace function public.add_submission_note(p_submission_id uuid, p_message text, p_visible_to_author boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.submission_status;
begin
  select s.status into v_status from public.submissions s
  where s.id = p_submission_id
    and (public.is_staff() or s.author_id = auth.uid());
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (p_submission_id, auth.uid(), v_status, v_status, left(p_message, 2000), p_visible_to_author);
end;
$$;

-- The reviewer's queue: their assignments with a BLINDED view of each
-- manuscript. No author names, emails, affiliations or cover letters, ever.
create or replace function public.reviewer_queue()
returns table (
  assignment_id uuid,
  assignment_status public.review_status,
  due_date date,
  recommendation public.review_recommendation,
  comments text,
  submitted_at timestamptz,
  assignment_version int,
  assigned_at timestamptz,
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
  select r.id, r.status, r.due_date, r.recommendation, r.comments, r.submitted_at, r.version, r.created_at,
         s.id, s.title, s.abstract, s.keywords, c.name, s.citation_style
  from public.review_assignments r
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  left join public.categories c on c.id = s.category_id
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  where r.reviewer_id = auth.uid() and r.status <> 'withdrawn'
  order by (r.status = 'pending') desc, r.due_date nulls last, r.created_at desc
$$;

revoke execute on function public.change_submission_status(uuid, int, public.submission_status, text, boolean) from public, anon;
revoke execute on function public.add_submission_note(uuid, text, boolean) from public, anon;
revoke execute on function public.reviewer_queue() from public, anon;
grant execute on function public.change_submission_status(uuid, int, public.submission_status, text, boolean) to authenticated;
grant execute on function public.add_submission_note(uuid, text, boolean) to authenticated;
grant execute on function public.reviewer_queue() to authenticated;

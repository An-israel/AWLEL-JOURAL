-- Reverses 20261017000011_security_hardening.sql (restores the earlier, looser rules).
grant execute on function public.schema_version() to anon;
drop function if exists public.record_revision(uuid);
drop function if exists public.reviewer_files();
create or replace function public.add_submission_note(p_submission_id uuid, p_message text, p_visible_to_author boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.submission_status;
begin
  select s.status into v_status from public.submissions s
  where s.id = p_submission_id and (public.is_staff() or s.author_id = auth.uid());
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
  values (p_submission_id, auth.uid(), v_status, v_status, left(p_message, 2000), p_visible_to_author);
end; $$;
create or replace function public.guard_review_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if old.status <> 'pending' then
    raise exception 'This review has already been submitted' using errcode = '42501';
  end if;
  if new.submission_id is distinct from old.submission_id or new.reviewer_id is distinct from old.reviewer_id
     or new.assigned_by is distinct from old.assigned_by or new.due_date is distinct from old.due_date
     or new.status not in ('pending', 'submitted') then
    raise exception 'Reviewers may only edit their own review' using errcode = '42501';
  end if;
  if new.status = 'submitted' then new.submitted_at := now(); end if;
  return new;
end; $$;
create policy "submissions: author read own" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.is_submission_author(public.submission_id_from_path(name))
         and exists (select 1 from public.submission_files f where f.path = objects.name and f.kind in ('original', 'revision')));
create policy "submissions: reviewer read assigned" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.is_assigned_reviewer(public.submission_id_from_path(name)));
create policy "submissions: author upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.is_submission_author(public.submission_id_from_path(name)));
create policy "submissions: reviewer upload annotated" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.is_assigned_reviewer(public.submission_id_from_path(name)));
drop policy if exists "submission_files: reviewer read own uploads" on public.submission_files;
create policy "submission_files: reviewer read assigned" on public.submission_files for select to authenticated
  using (public.is_assigned_reviewer(submission_id) and (kind in ('original', 'revision') or uploaded_by = (select auth.uid())));

-- =============================================================================
-- Storage buckets and policies (section 8)
--
--   issue-covers     public   cover images
--   site-assets      public   logo, default OG image, board photos
--   published-files  PRIVATE  article/issue PDF + DOCX. Served only through
--                             /api/download/*, which checks the item is
--                             published, records the download and redirects
--                             to a short-lived signed URL. Drafts never leak.
--   submissions      PRIVATE  manuscripts; author, assigned reviewers, staff.
--
-- Uploads go browser -> Storage with signed upload URLs minted server-side
-- after a role check (item 90); the insert policies below are a second line
-- of defence for direct API use.
-- Reversal: supabase/rollbacks/20261017000005_storage.down.sql
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('issue-covers', 'issue-covers', true, 10485760,
     array['image/jpeg', 'image/png', 'image/webp']),
  ('site-assets', 'site-assets', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('published-files', 'published-files', false, 104857600,
     array['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('submissions', 'submissions', false, 20971520,
     array['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets: anyone may read; only staff write. Board photos and site
-- assets are Super Admin content, covers are editor content.
create policy "covers: public read" on storage.objects for select
  using (bucket_id = 'issue-covers');
create policy "covers: staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-covers' and (select public.is_staff()));
create policy "covers: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'issue-covers' and (select public.is_staff()));
create policy "covers: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'issue-covers' and (select public.is_staff()));

create policy "site assets: public read" on storage.objects for select
  using (bucket_id = 'site-assets');
create policy "site assets: super admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and (select public.is_super_admin()));
create policy "site assets: super admin update" on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and (select public.is_super_admin()));
create policy "site assets: super admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and (select public.is_super_admin()));

-- Published files: staff only at the storage layer. Readers get signed URLs.
create policy "published files: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'published-files' and (select public.is_staff()));
create policy "published files: staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'published-files' and (select public.is_staff()));
create policy "published files: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'published-files' and (select public.is_staff()));
create policy "published files: super admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'published-files' and (select public.is_super_admin()));

-- Submissions: object names are "<submission_id>/<file>".
create or replace function public.submission_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy "submissions: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (select public.is_staff()));
create policy "submissions: author read own" on storage.objects for select to authenticated
  using (bucket_id = 'submissions'
         and public.is_submission_author(public.submission_id_from_path(name))
         and exists (select 1 from public.submission_files f
                     where f.path = objects.name and f.kind in ('original', 'revision')));
create policy "submissions: reviewer read assigned" on storage.objects for select to authenticated
  using (bucket_id = 'submissions'
         and public.is_assigned_reviewer(public.submission_id_from_path(name)));
create policy "submissions: author upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions'
              and public.is_submission_author(public.submission_id_from_path(name)));
create policy "submissions: reviewer upload annotated" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions'
              and public.is_assigned_reviewer(public.submission_id_from_path(name)));
create policy "submissions: staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (select public.is_staff()));
create policy "submissions: super admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (select public.is_super_admin()));

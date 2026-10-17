-- Reverses 20261017000005_storage.sql (policies and helper function).
drop policy if exists "covers: public read" on storage.objects;
drop policy if exists "covers: staff write" on storage.objects;
drop policy if exists "covers: staff update" on storage.objects;
drop policy if exists "covers: staff delete" on storage.objects;
drop policy if exists "site assets: public read" on storage.objects;
drop policy if exists "site assets: super admin write" on storage.objects;
drop policy if exists "site assets: super admin update" on storage.objects;
drop policy if exists "site assets: super admin delete" on storage.objects;
drop policy if exists "published files: staff read" on storage.objects;
drop policy if exists "published files: staff write" on storage.objects;
drop policy if exists "published files: staff update" on storage.objects;
drop policy if exists "published files: super admin delete" on storage.objects;
drop policy if exists "submissions: staff read" on storage.objects;
drop policy if exists "submissions: author read own" on storage.objects;
drop policy if exists "submissions: reviewer read assigned" on storage.objects;
drop policy if exists "submissions: author upload own" on storage.objects;
drop policy if exists "submissions: reviewer upload annotated" on storage.objects;
drop policy if exists "submissions: staff write" on storage.objects;
drop policy if exists "submissions: super admin delete" on storage.objects;
drop function if exists public.submission_id_from_path(text);
-- Buckets are left in place: Supabase blocks direct deletes from storage
-- tables. Empty and delete them in the dashboard or with the Storage API
-- (supabase.storage.emptyBucket / deleteBucket) if they must go.

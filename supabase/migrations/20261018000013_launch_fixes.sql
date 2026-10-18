-- =============================================================================
-- Launch fixes: published files limited to 50 MB, the most Supabase's Free
-- plan accepts for one upload (its global upload limit). With 100 MB here,
-- editors were told a 70 MB issue PDF was fine and then saw the upload fail.
-- On Supabase Pro, raise the global limit (Storage → Settings) first, then
-- this bucket's limit and SLOT_RULES in lib/admin/file-slots.ts.
-- Only lowers the limit, so a project already set lower is left as it is.
-- Reversal: supabase/rollbacks/20261018000013_launch_fixes.down.sql
-- =============================================================================
update storage.buckets
set file_size_limit = 52428800
where id = 'published-files'
  and (file_size_limit is null or file_size_limit > 52428800);

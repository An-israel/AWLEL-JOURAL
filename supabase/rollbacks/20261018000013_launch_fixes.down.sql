-- Reverses 20261018000013_launch_fixes.sql.
update storage.buckets
set file_size_limit = 104857600
where id = 'published-files';

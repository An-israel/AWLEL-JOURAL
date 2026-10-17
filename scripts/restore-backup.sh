#!/usr/bin/env bash
# Restores a backup made by .github/workflows/backup.yml (item 83).
#
#   1. Create the target database's schema from the migrations in git first:
#        git checkout <commit in the backup's meta.json>
#        npx supabase link --project-ref <ref> && npx supabase db push
#      (The dump's schema.sql is kept for reference only: it misses objects
#      that live outside the public schema, such as the trigger that creates
#      a profile for each new user and the storage policies.)
#   2. Then load the data:
#        scripts/restore-backup.sh awlel-db-YYYY-MM-DD.tar.gz "<database URL>"
#
# This EMPTIES the target's journal, auth and storage tables before loading.
# Run it only against a new project or one you mean to overwrite.
set -euo pipefail

archive="${1:?usage: restore-backup.sh <awlel-db-*.tar.gz> <database-url>}"
db_url="${2:?usage: restore-backup.sh <awlel-db-*.tar.gz> <database-url>}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xzf "$archive" -C "$work"
test -f "$work/data.sql" || { echo "No data.sql in $archive" >&2; exit 1; }
[ -f "$work/meta.json" ] && { echo "Backup details:"; cat "$work/meta.json"; echo; }

read -r -p "This replaces ALL data in the target database. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

psql "$db_url" --single-transaction -v ON_ERROR_STOP=1 <<'SQL'
set session_replication_role = replica;
do $$
declare t record;
begin
  for t in
    select schemaname, tablename from pg_tables
    where (schemaname = 'public')
       or (schemaname in ('auth', 'storage') and tablename not in ('schema_migrations', 'migrations', 'buckets_vectors', 'vector_indexes'))
  loop
    execute format('truncate %I.%I cascade', t.schemaname, t.tablename);
  end loop;
end $$;
SQL

psql "$db_url" --single-transaction -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" -f "$work/data.sql"

echo "Data restored. Row counts:"
psql "$db_url" -c "select (select count(*) from auth.users) users, (select count(*) from public.issues) issues,
  (select count(*) from public.articles) articles, (select count(*) from public.stored_files) files,
  (select count(*) from storage.objects) objects"
echo "Next: restore the stored files (awlel-files-*.tar.gz) as described in docs/RUNBOOK.md."

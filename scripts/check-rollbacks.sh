#!/usr/bin/env bash
# Applies every rollback newest-first against the local Supabase database,
# then re-applies all migrations. Fails if any reversal is broken (item 55).
set -euo pipefail
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/.."
for f in $(ls supabase/rollbacks/*.down.sql | sort -r); do
  echo "rollback: $f"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
leftover=$(psql "$DB_URL" -tA -c "select count(*) from pg_tables where schemaname = 'public'")
if [ "$leftover" != "0" ]; then
  echo "rollbacks left $leftover public tables behind" >&2
  exit 1
fi
npx supabase db reset

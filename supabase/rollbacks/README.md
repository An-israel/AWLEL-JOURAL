# Migration rollbacks

Supabase CLI migrations only run forward. Each migration in `../migrations`
has a matching `*.down.sql` here that reverses it. Roll back newest-first.

```bash
# 1. Take a backup first (see docs/RUNBOOK.md).
# 2. Apply the reversal:
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/<version>_<name>.down.sql
# 3. Remove the migration record so `supabase db push` can re-apply later:
psql "$SUPABASE_DB_URL" -c "delete from supabase_migrations.schema_migrations where version = '<version>'"
```

CI applies every migration, then every rollback newest-first, then every
migration again, so a broken reversal fails the build.

Reversals that drop tables **destroy data**. In production, prefer a new
forward migration that fixes the problem; use these only on a fresh deploy or
after restoring a backup.

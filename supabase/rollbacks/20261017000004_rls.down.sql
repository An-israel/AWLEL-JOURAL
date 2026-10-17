-- Reverses 20261017000004_rls.sql: drops every policy and disables RLS.
-- WARNING: leaves tables readable/writable per default grants. Only use as part
-- of a full rollback to an earlier schema.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('alter table public.%I disable row level security', r.tablename);
  end loop;
end $$;
drop view if exists public.public_article_authors;
drop function if exists public.is_published_article(uuid);
drop function if exists public.feature_enabled(text);

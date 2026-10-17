-- Reverses 20261017000007_admin_writes.sql.
drop function if exists public.reorder_rows(text, uuid[]);
drop function if exists public.set_issue_status(uuid, int, public.publish_status, boolean);
drop function if exists public.save_article(uuid, int, jsonb, jsonb);
-- Restore the counting rule from migration 6.
create or replace function public.categories_with_counts()
returns table (id uuid, name text, slug text, description text, sort_order int, article_count bigint)
language sql stable set search_path = ''
as $$
  select c.id, c.name, c.slug, c.description, c.sort_order, count(a.id) as article_count
  from public.categories c
  left join public.articles a on a.category_id = c.id
  where not c.is_archived
  group by c.id
  order by c.sort_order, c.name
$$;

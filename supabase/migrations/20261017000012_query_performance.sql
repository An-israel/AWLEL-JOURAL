-- =============================================================================
-- Query performance (item 26), from EXPLAIN ANALYZE on 2,000 synthetic
-- articles: the public author view called is_published_article() for every
-- row of article_authors, so a lookup for 50 articles scanned all authors
-- (86 ms at 4,000 authors, growing with the archive). Joining the published
-- articles and issues instead lets the planner use article_authors_article_idx.
-- Same columns, same rules: only authors of published articles in published
-- issues, and email only where the author chose to show it.
-- Reversal: supabase/rollbacks/20261017000012_query_performance.down.sql
-- =============================================================================
create or replace view public.public_article_authors
with (security_barrier = true)
as
  select aa.id, aa.article_id, aa.full_name, aa.affiliation, aa.orcid, aa.position,
         aa.is_corresponding,
         case when aa.show_email then aa.email end as email
  from public.article_authors aa
  join public.articles a on a.id = aa.article_id and a.status = 'published' and a.deleted_at is null
  join public.issues i on i.id = a.issue_id and i.status = 'published' and i.deleted_at is null;

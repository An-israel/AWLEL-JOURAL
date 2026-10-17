-- Reverses 20261017000012_query_performance.sql.
create or replace view public.public_article_authors
with (security_barrier = true)
as
  select aa.id, aa.article_id, aa.full_name, aa.affiliation, aa.orcid, aa.position,
         aa.is_corresponding,
         case when aa.show_email then aa.email end as email
  from public.article_authors aa
  where public.is_published_article(aa.article_id);

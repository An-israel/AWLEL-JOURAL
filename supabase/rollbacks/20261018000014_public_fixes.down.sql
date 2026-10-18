-- Reverses 20261018000014_public_fixes.sql: restores search_articles as
-- defined in 20261017000006_public_reads.sql and removes the licence settings.

create or replace function public.search_articles(
  p_query text,
  p_year int default null,
  p_volume int default null,
  p_issue_id uuid default null,
  p_category_slug text default null,
  p_author text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  title_highlight text,
  abstract_highlight text,
  rank real,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select case when coalesce(trim(p_query), '') = '' then null
           else websearch_to_tsquery('english', extensions.unaccent(p_query)) end as tsq
  ),
  matches as (
    select a.id, a.slug, a.title, a.abstract, a.published_at,
           case when q.tsq is null then 0 else ts_rank_cd(a.search_vector, q.tsq) end as rank,
           q.tsq
    from public.articles a
    join public.issues i on i.id = a.issue_id
    join public.volumes v on v.id = i.volume_id
    left join public.categories c on c.id = a.category_id
    cross join q
    where a.deleted_at is null
      and (q.tsq is null or a.search_vector @@ q.tsq)
      and (p_year is null or v.year = p_year)
      and (p_volume is null or v.volume_number = p_volume)
      and (p_issue_id is null or a.issue_id = p_issue_id)
      and (p_category_slug is null or c.slug = p_category_slug)
      and (p_author is null or exists (
            select 1 from public.public_article_authors aa
            where aa.article_id = a.id and aa.full_name ilike '%' || p_author || '%'))
  )
  select m.id, m.slug, m.title,
         case when m.tsq is null then m.title
              else ts_headline('english', m.title, m.tsq,
                     'StartSel=[[[, StopSel=]]], HighlightAll=true') end,
         case when m.tsq is null then left(regexp_replace(coalesce(m.abstract, ''), '<[^>]+>', ' ', 'g'), 280)
              else ts_headline('english', regexp_replace(coalesce(m.abstract, ''), '<[^>]+>', ' ', 'g'), m.tsq,
                     'StartSel=[[[, StopSel=]]], MaxFragments=2, MaxWords=30, MinWords=12, FragmentDelimiter= … ') end,
         m.rank::real,
         count(*) over ()
  from matches m
  order by m.rank desc, m.published_at desc nulls last
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;

drop function if exists public.html_to_text(text);

alter table public.site_settings drop constraint if exists site_settings_license_url_check;
alter table public.site_settings drop constraint if exists site_settings_license_name_check;
alter table public.site_settings
  drop column if exists license_url,
  drop column if exists license_name;

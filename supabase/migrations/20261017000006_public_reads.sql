-- =============================================================================
-- Read helpers for the public site: full-text search, category counts and a
-- combined download counter. All functions are SECURITY INVOKER, so RLS still
-- decides what each caller can see (anonymous visitors: published only).
-- Reversal: supabase/rollbacks/20261017000006_public_reads.down.sql
-- =============================================================================

-- Combined downloads, so "most downloaded" can be ordered by one column.
alter table public.articles
  add column download_count bigint generated always as (download_pdf_count + download_docx_count) stored;
create index articles_view_count_idx on public.articles (view_count desc) where status = 'published' and deleted_at is null;
create index articles_download_count_idx on public.articles (download_count desc) where status = 'published' and deleted_at is null;

-- The generated column moves with the counters, so it must not count as an
-- editorial change either (optimistic locking, item 36).
drop trigger articles_updated_at on public.articles;
drop trigger articles_version on public.articles;
create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at(
    'search_vector', 'view_count', 'download_pdf_count', 'download_docx_count', 'download_count');
create trigger articles_version before update on public.articles
  for each row execute function public.bump_version(
    'search_vector', 'view_count', 'download_pdf_count', 'download_docx_count', 'download_count');

-- Categories with the number of articles the caller can see.
create or replace function public.categories_with_counts()
returns table (id uuid, name text, slug text, description text, sort_order int, article_count bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.description, c.sort_order, count(a.id) as article_count
  from public.categories c
  left join public.articles a on a.category_id = c.id
  where not c.is_archived
  group by c.id
  order by c.sort_order, c.name
$$;

-- Full-text search over title, abstract, keywords and author names (section 5.5).
-- Highlights use the markers [[[ and ]]] so the client renders them as <mark>
-- elements without ever injecting HTML.
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

grant execute on function public.categories_with_counts() to anon, authenticated;
grant execute on function public.search_articles(text, int, int, uuid, text, text, int, int) to anon, authenticated;

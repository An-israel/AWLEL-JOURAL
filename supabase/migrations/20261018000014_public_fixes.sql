-- =============================================================================
-- Public site fixes (audit items 21, 28, 33 and 41).
--   - search_articles: a stable order for paging, table-of-contents order when
--     filtering by issue, author names matched literally (% and _ are not
--     wildcards), and readable snippets (entities decoded, cut at a word with
--     an ellipsis, fragments joined by " … ").
--   - site_settings: an optional licence (name and link) shown on article
--     pages and in their metadata when set.
-- Additive and safe to run twice.
-- Reversal: supabase/rollbacks/20261018000014_public_fixes.down.sql
-- =============================================================================

-- 1. Licence (item 41). Both optional; nothing is shown until a name is set.
alter table public.site_settings
  add column if not exists license_name text,
  add column if not exists license_url text;
alter table public.site_settings drop constraint if exists site_settings_license_name_check;
alter table public.site_settings
  add constraint site_settings_license_name_check check (char_length(license_name) between 1 and 120);
alter table public.site_settings drop constraint if exists site_settings_license_url_check;
alter table public.site_settings
  add constraint site_settings_license_url_check
  check (license_url ~ '^https?://[^\s]+$' and char_length(license_url) <= 500);

-- 2. Rich text to plain text for search snippets: tags become spaces, the
--    entities the editor produces are decoded, and whitespace is collapsed.
create or replace function public.html_to_text(p_html text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(coalesce(p_html, ''), '<[^>]+>', ' ', 'g'),
      '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&apos;', ''''),
      '&amp;', '&'),
    '\s+', ' ', 'g'))
$$;

-- 3. Search (items 21, 28 and 33). Same signature and columns as before.
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
           else websearch_to_tsquery('english', extensions.unaccent(p_query)) end as tsq,
           -- An author search matches the typed text literally: % and _ are
           -- escaped so they are not LIKE wildcards.
           case when coalesce(trim(p_author), '') = '' then null
           else '%' || replace(replace(replace(trim(p_author), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as author_pattern
  ),
  matches as (
    select a.id, a.slug, a.title, public.html_to_text(a.abstract) as abstract_text, a.published_at,
           a.sort_order, i.published_at as issue_published_at,
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
      and (q.author_pattern is null or exists (
            select 1 from public.public_article_authors aa
            where aa.article_id = a.id and aa.full_name ilike q.author_pattern))
  )
  select m.id, m.slug, m.title,
         case when m.tsq is null then m.title
              else ts_headline('english', m.title, m.tsq,
                     'StartSel=[[[, StopSel=]]], HighlightAll=true') end,
         case when m.tsq is null then
                -- The opening of the abstract, cut at a word with an ellipsis.
                case when char_length(m.abstract_text) <= 280 then m.abstract_text
                     else regexp_replace(left(m.abstract_text, 281), '[\s,;:.–—-]*\S*$', '') || '…' end
              else ts_headline('english', m.abstract_text, m.tsq,
                     'StartSel=[[[, StopSel=]]], MaxFragments=2, MaxWords=30, MinWords=12, FragmentDelimiter=" … "') end,
         m.rank::real,
         count(*) over ()
  from matches m
  -- Ties are broken all the way down to the id, so paging never repeats or
  -- skips an article. Within one issue, articles follow its table of contents.
  order by m.rank desc,
           case when p_issue_id is not null then m.sort_order end,
           m.published_at desc nulls last,
           m.issue_published_at desc nulls last,
           m.sort_order,
           m.id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;

grant execute on function public.html_to_text(text) to anon, authenticated;
grant execute on function public.search_articles(text, int, int, uuid, text, text, int, int) to anon, authenticated;

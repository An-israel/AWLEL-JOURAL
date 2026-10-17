-- =============================================================================
-- Admin write functions. All are SECURITY INVOKER: they run as the signed-in
-- editor, so RLS still decides who may write, and the audit triggers record
-- the real actor. Each does its work in one transaction (items 18, 39).
--
-- Optimistic locking (item 36): callers pass the version they loaded; if the
-- row has moved on, the function raises SQLSTATE 'AW409' and nothing changes.
-- Reversal: supabase/rollbacks/20261017000007_admin_writes.down.sql
-- =============================================================================

-- Article + ordered authors, saved together.
create or replace function public.save_article(
  p_id uuid,
  p_expected_version int,
  p_data jsonb,
  p_authors jsonb
)
returns table (id uuid, version int)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_version int;
begin
  if v_id is null then
    insert into public.articles (
      issue_id, category_id, title, slug, abstract, keywords, first_page, last_page, doi,
      citation_style, sort_order, published_at, submission_id, created_by, updated_by)
    values (
      (p_data ->> 'issue_id')::uuid,
      nullif(p_data ->> 'category_id', '')::uuid,
      p_data ->> 'title',
      p_data ->> 'slug',
      p_data ->> 'abstract',
      coalesce(array(select jsonb_array_elements_text(p_data -> 'keywords')), '{}'),
      nullif(p_data ->> 'first_page', '')::int,
      nullif(p_data ->> 'last_page', '')::int,
      nullif(p_data ->> 'doi', ''),
      (p_data ->> 'citation_style')::public.citation_style,
      coalesce((select max(a.sort_order) + 10 from public.articles a
                where a.issue_id = (p_data ->> 'issue_id')::uuid), 10),
      nullif(p_data ->> 'published_at', '')::timestamptz,
      nullif(p_data ->> 'submission_id', '')::uuid,
      auth.uid(), auth.uid())
    returning articles.id, articles.version into v_id, v_version;
  else
    update public.articles a set
      issue_id = (p_data ->> 'issue_id')::uuid,
      category_id = nullif(p_data ->> 'category_id', '')::uuid,
      title = p_data ->> 'title',
      slug = p_data ->> 'slug',
      abstract = p_data ->> 'abstract',
      keywords = coalesce(array(select jsonb_array_elements_text(p_data -> 'keywords')), '{}'),
      first_page = nullif(p_data ->> 'first_page', '')::int,
      last_page = nullif(p_data ->> 'last_page', '')::int,
      doi = nullif(p_data ->> 'doi', ''),
      citation_style = (p_data ->> 'citation_style')::public.citation_style,
      published_at = nullif(p_data ->> 'published_at', '')::timestamptz,
      updated_by = auth.uid()
    where a.id = v_id and a.version = p_expected_version
    returning a.version into v_version;
    if not found then
      raise exception 'This article was changed by someone else.' using errcode = 'AW409';
    end if;
    delete from public.article_authors aa where aa.article_id = v_id;
  end if;

  insert into public.article_authors (article_id, full_name, affiliation, email, show_email, orcid, position, is_corresponding)
  select v_id,
         x ->> 'full_name',
         nullif(x ->> 'affiliation', ''),
         nullif(x ->> 'email', ''),
         coalesce((x ->> 'show_email')::boolean, false),
         nullif(x ->> 'orcid', ''),
         (ord - 1)::int,
         coalesce((x ->> 'is_corresponding')::boolean, false)
  from jsonb_array_elements(coalesce(p_authors, '[]'::jsonb)) with ordinality as t(x, ord);

  -- Saving authors refreshed the search vector; return the final version.
  select a.version into v_version from public.articles a where a.id = v_id;
  return query select v_id, v_version;
end;
$$;

-- Publish/unpublish an issue, optionally with its draft articles. The
-- advisory lock stops two editors publishing the same issue at once (item 38).
create or replace function public.set_issue_status(
  p_issue_id uuid,
  p_expected_version int,
  p_status public.publish_status,
  p_include_articles boolean default false
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_version int;
begin
  perform pg_advisory_xact_lock(hashtext('awlel:issue:' || p_issue_id::text));
  update public.issues i set
    status = p_status,
    published_at = case when p_status = 'published' then coalesce(i.published_at, now()) else i.published_at end
  where i.id = p_issue_id and i.version = p_expected_version and i.deleted_at is null
  returning i.version into v_version;
  if not found then
    raise exception 'This issue was changed by someone else.' using errcode = 'AW409';
  end if;
  if p_status = 'published' and p_include_articles then
    update public.articles a set status = 'published', published_at = coalesce(a.published_at, now())
    where a.issue_id = p_issue_id and a.status = 'draft' and a.deleted_at is null;
  end if;
  return v_version;
end;
$$;

-- Reorders rows by the given id order (10, 20, 30, ...). Whitelisted tables only.
create or replace function public.reorder_rows(p_table text, p_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_table not in ('articles', 'categories', 'editorial_board_groups', 'editorial_board_members', 'department_milestones') then
    raise exception 'Cannot reorder %', p_table using errcode = '42501';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord * 10
       from unnest($1) with ordinality as o(id, ord)
      where t.id = o.id and t.sort_order is distinct from o.ord * 10',
    p_table)
  using p_ids;
end;
$$;

-- Staff counts include drafts; soft-deleted articles never count.
create or replace function public.categories_with_counts()
returns table (id uuid, name text, slug text, description text, sort_order int, article_count bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.description, c.sort_order, count(a.id) as article_count
  from public.categories c
  left join public.articles a on a.category_id = c.id and a.deleted_at is null
  where not c.is_archived
  group by c.id
  order by c.sort_order, c.name
$$;

revoke execute on function public.save_article(uuid, int, jsonb, jsonb) from public, anon;
revoke execute on function public.set_issue_status(uuid, int, public.publish_status, boolean) from public, anon;
revoke execute on function public.reorder_rows(text, uuid[]) from public, anon;
grant execute on function public.save_article(uuid, int, jsonb, jsonb) to authenticated;
grant execute on function public.set_issue_status(uuid, int, public.publish_status, boolean) to authenticated;
grant execute on function public.reorder_rows(text, uuid[]) to authenticated;

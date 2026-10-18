-- Reverses 20261018000017_admin_fixes.sql. Dropping the redirect and revision
-- tables destroys the old addresses and page history they hold.
drop trigger if exists pages_audit on public.pages;
create trigger pages_audit after update of content on public.pages
  for each row execute function public.audit_changes();

drop trigger if exists pages_revision on public.pages;
drop function if exists public.record_page_revision();
drop table if exists public.page_revisions;

drop trigger if exists categories_slug_redirect on public.categories;
drop function if exists public.record_category_redirect();
drop table if exists public.category_redirects;

drop trigger if exists volumes_redirect on public.volumes;
drop trigger if exists issues_redirect on public.issues;
drop function if exists public.record_issue_redirect();
drop table if exists public.issue_redirects;

drop function if exists public.delete_issue_forever(uuid);

drop trigger if exists issues_keep_published_at on public.issues;
drop trigger if exists articles_keep_published_at on public.articles;
drop function if exists public.keep_published_at();

-- Restore save_article from migration 7.
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

drop function if exists public.unique_article_slug(text, uuid);

-- Restore the audit trigger function from migration 1.
create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entity text := tg_table_name;
  rec_id text;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  k text;
begin
  rec_id := coalesce(n ->> 'id', o ->> 'id');

  if tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
    values (actor, 'delete', entity, rec_id, jsonb_build_object('old', o));
    return old;
  end if;

  if tg_op = 'INSERT' then
    if n ? 'status' and n ->> 'status' = 'published' then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
      values (actor, 'publish', entity, rec_id, jsonb_build_object('status', n -> 'status'));
    end if;
    return new;
  end if;

  if n ? 'status' and (o ->> 'status') is distinct from (n ->> 'status') then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
    values (actor,
            case n ->> 'status' when 'published' then 'publish'
                                when 'draft' then 'unpublish'
                                else 'status_change' end,
            entity, rec_id,
            jsonb_build_object('from', o -> 'status', 'to', n -> 'status'));
  end if;

  if n ? 'deleted_at' and (o ->> 'deleted_at') is distinct from (n ->> 'deleted_at') then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
    values (actor, case when n ->> 'deleted_at' is null then 'restore' else 'soft_delete' end,
            entity, rec_id, '{}'::jsonb);
  end if;

  if entity = 'profiles' and ((o ->> 'role') is distinct from (n ->> 'role')
      or (o ->> 'is_active') is distinct from (n ->> 'is_active')) then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
    values (actor, 'role_change', entity, rec_id,
            jsonb_build_object('from', jsonb_build_object('role', o -> 'role', 'is_active', o -> 'is_active'),
                               'to', jsonb_build_object('role', n -> 'role', 'is_active', n -> 'is_active')));
  end if;

  foreach k in array array['cover_file_id', 'full_pdf_file_id', 'full_docx_file_id',
                           'pdf_file_id', 'docx_file_id', 'photo_file_id',
                           'logo_file_id', 'default_og_image_file_id'] loop
    if n ? k and (o ->> k) is not null and (o ->> k) is distinct from (n ->> k) then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
      values (actor, 'file_replace', entity, rec_id,
              jsonb_build_object('field', k, 'from', o -> k, 'to', n -> k));
    end if;
  end loop;

  return new;
end;
$$;

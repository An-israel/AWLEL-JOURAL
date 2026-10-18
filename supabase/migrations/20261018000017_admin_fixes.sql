-- =============================================================================
-- Admin dashboard fixes (audit items 68, 72, 73, 74, 76, 78, 81).
--   * A published article or issue never loses its publication date (68).
--   * Bulk upload gets unique web addresses automatically (72).
--   * Moving an article to another issue puts it at the end of that issue (78).
--   * A trashed issue can be deleted for good once its articles are gone (73).
--   * Old issue and category addresses keep working after a renumber or a
--     new web address (74, 81).
--   * Every page save is kept as a revision, and edits to pages, settings,
--     categories, board members and feature switches reach the audit log (76).
-- Reversal: supabase/rollbacks/20261018000017_admin_fixes.down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Publication dates (item 68). Saving a form with an empty date used to
--    set published_at to NULL on a live article. Whatever writes the row, a
--    published article or issue keeps its date (or gets today's); an editor
--    can still change it to another date.
-- ---------------------------------------------------------------------------
create or replace function public.keep_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := coalesce(case when tg_op = 'UPDATE' then old.published_at end, now());
  end if;
  return new;
end;
$$;

drop trigger if exists articles_keep_published_at on public.articles;
create trigger articles_keep_published_at before insert or update on public.articles
  for each row execute function public.keep_published_at();
drop trigger if exists issues_keep_published_at on public.issues;
create trigger issues_keep_published_at before insert or update on public.issues
  for each row execute function public.keep_published_at();

-- ---------------------------------------------------------------------------
-- 2. Unique article web addresses (item 72). Slugs are unique across all
--    articles, trashed ones included, and old addresses that now redirect are
--    kept free too. Returns the slug itself when free, otherwise slug-2,
--    slug-3, ... (still at most 80 characters).
-- ---------------------------------------------------------------------------
create or replace function public.unique_article_slug(p_slug text, p_except uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate text := p_slug;
  n int := 1;
begin
  loop
    exit when not exists (select 1 from public.articles a
                          where a.slug = candidate and a.id is distinct from p_except)
          and not exists (select 1 from public.slug_redirects r where r.old_slug = candidate);
    n := n + 1;
    candidate := regexp_replace(left(p_slug, 80 - length(n::text) - 1), '-+$', '') || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- save_article: as migration 7, plus
--   * p_data.auto_slug = true makes the slug unique automatically (bulk upload);
--     a slug typed by hand still fails with the friendly "already used" error;
--   * an empty publication date never clears the date of a published article;
--   * moving to another issue puts the article at the end of that issue (78).
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
  v_issue uuid := (p_data ->> 'issue_id')::uuid;
  v_slug text := p_data ->> 'slug';
begin
  if coalesce((p_data ->> 'auto_slug')::boolean, false) then
    v_slug := public.unique_article_slug(v_slug, v_id);
  end if;

  if v_id is null then
    insert into public.articles (
      issue_id, category_id, title, slug, abstract, keywords, first_page, last_page, doi,
      citation_style, sort_order, published_at, submission_id, created_by, updated_by)
    values (
      v_issue,
      nullif(p_data ->> 'category_id', '')::uuid,
      p_data ->> 'title',
      v_slug,
      p_data ->> 'abstract',
      coalesce(array(select jsonb_array_elements_text(p_data -> 'keywords')), '{}'),
      nullif(p_data ->> 'first_page', '')::int,
      nullif(p_data ->> 'last_page', '')::int,
      nullif(p_data ->> 'doi', ''),
      (p_data ->> 'citation_style')::public.citation_style,
      coalesce((select max(a.sort_order) + 10 from public.articles a where a.issue_id = v_issue), 10),
      nullif(p_data ->> 'published_at', '')::timestamptz,
      nullif(p_data ->> 'submission_id', '')::uuid,
      auth.uid(), auth.uid())
    returning articles.id, articles.version into v_id, v_version;
  else
    update public.articles a set
      issue_id = v_issue,
      category_id = nullif(p_data ->> 'category_id', '')::uuid,
      title = p_data ->> 'title',
      slug = v_slug,
      abstract = p_data ->> 'abstract',
      keywords = coalesce(array(select jsonb_array_elements_text(p_data -> 'keywords')), '{}'),
      first_page = nullif(p_data ->> 'first_page', '')::int,
      last_page = nullif(p_data ->> 'last_page', '')::int,
      doi = nullif(p_data ->> 'doi', ''),
      citation_style = (p_data ->> 'citation_style')::public.citation_style,
      sort_order = case
        when a.issue_id is distinct from v_issue then
          coalesce((select max(b.sort_order) + 10 from public.articles b where b.issue_id = v_issue), 10)
        else a.sort_order end,
      published_at = case
        when a.status = 'published' then coalesce(nullif(p_data ->> 'published_at', '')::timestamptz, a.published_at)
        else nullif(p_data ->> 'published_at', '')::timestamptz end,
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

-- ---------------------------------------------------------------------------
-- 3. Delete a trashed issue for good (item 73). Super Admin only, like every
--    other permanent delete. Allowed only when the issue is in the trash and
--    every article in it is in the trash too; those trashed articles go with
--    it. SECURITY INVOKER, so RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.delete_issue_forever(p_issue_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deleted timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete an issue for good.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('awlel:issue:' || p_issue_id::text));
  select i.deleted_at into v_deleted from public.issues i where i.id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found.' using errcode = 'P0002';
  end if;
  if v_deleted is null then
    raise exception 'Move the issue to the trash first.' using errcode = 'AW422';
  end if;
  if exists (select 1 from public.articles a where a.issue_id = p_issue_id and a.deleted_at is null) then
    raise exception 'This issue still has articles that are not in the trash.' using errcode = 'AW422';
  end if;
  delete from public.articles a where a.issue_id = p_issue_id;
  delete from public.issues i where i.id = p_issue_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Old issue addresses (item 74). /issues/{volume}/{issue} is built from
--    the volume and issue numbers, so renumbering a published issue (or its
--    volume) would break links. The old numbers are kept here and the public
--    issue page redirects them to the issue's current address.
-- ---------------------------------------------------------------------------
create table if not exists public.issue_redirects (
  volume_number int not null,
  issue_number int not null,
  issue_id uuid not null references public.issues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (volume_number, issue_number)
);
create index if not exists issue_redirects_issue_idx on public.issue_redirects (issue_id);
alter table public.issue_redirects enable row level security;

drop policy if exists "issue_redirects: public read for published" on public.issue_redirects;
create policy "issue_redirects: public read for published" on public.issue_redirects for select
  using (exists (select 1 from public.issues i
                 where i.id = issue_redirects.issue_id and i.status = 'published' and i.deleted_at is null));
drop policy if exists "issue_redirects: staff read" on public.issue_redirects;
create policy "issue_redirects: staff read" on public.issue_redirects for select to authenticated
  using ((select public.is_staff()));

-- Runs as definer: editors never write redirects directly.
create or replace function public.record_issue_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_volume int;
  new_volume int;
begin
  if tg_table_name = 'issues' then
    if (new.volume_id, new.issue_number) is not distinct from (old.volume_id, old.issue_number) then
      return new;
    end if;
    select v.volume_number into old_volume from public.volumes v where v.id = old.volume_id;
    select v.volume_number into new_volume from public.volumes v where v.id = new.volume_id;
    -- Only addresses people could have seen: the issue was live when renumbered.
    if old.status = 'published' and old.deleted_at is null then
      insert into public.issue_redirects (volume_number, issue_number, issue_id)
      values (old_volume, old.issue_number, old.id)
      on conflict (volume_number, issue_number) do update set issue_id = excluded.issue_id, created_at = now();
    end if;
    -- An address that is in use again must not also redirect elsewhere.
    delete from public.issue_redirects r where r.volume_number = new_volume and r.issue_number = new.issue_number;
  else
    if new.volume_number is not distinct from old.volume_number then
      return new;
    end if;
    insert into public.issue_redirects (volume_number, issue_number, issue_id)
    select old.volume_number, i.issue_number, i.id
    from public.issues i
    where i.volume_id = new.id and i.status = 'published' and i.deleted_at is null
    on conflict (volume_number, issue_number) do update set issue_id = excluded.issue_id, created_at = now();
    delete from public.issue_redirects r
    where r.volume_number = new.volume_number
      and r.issue_number in (select i.issue_number from public.issues i where i.volume_id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists issues_redirect on public.issues;
create trigger issues_redirect after update of volume_id, issue_number on public.issues
  for each row execute function public.record_issue_redirect();
drop trigger if exists volumes_redirect on public.volumes;
create trigger volumes_redirect after update of volume_number on public.volumes
  for each row execute function public.record_issue_redirect();

-- ---------------------------------------------------------------------------
-- 5. Old category addresses (item 81), the same way article slugs work.
-- ---------------------------------------------------------------------------
create table if not exists public.category_redirects (
  old_slug text primary key,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists category_redirects_category_idx on public.category_redirects (category_id);
alter table public.category_redirects enable row level security;

drop policy if exists "category_redirects: public read" on public.category_redirects;
create policy "category_redirects: public read" on public.category_redirects for select using (true);

create or replace function public.record_category_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.category_redirects (old_slug, category_id)
    values (old.slug, old.id)
    on conflict (old_slug) do update set category_id = excluded.category_id, created_at = now();
    delete from public.category_redirects where old_slug = new.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_slug_redirect on public.categories;
create trigger categories_slug_redirect after update of slug on public.categories
  for each row execute function public.record_category_redirect();

-- ---------------------------------------------------------------------------
-- 6. Page history (item 76): one row per saved version of a static page. The
--    first save also keeps the version that was there before, so the
--    original text can always be brought back.
-- ---------------------------------------------------------------------------
create table if not exists public.page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  title text not null,
  content text not null,
  meta_description text,
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz not null default now()
);
create index if not exists page_revisions_page_idx on public.page_revisions (page_id, saved_at desc);
create index if not exists page_revisions_saved_by_idx on public.page_revisions (saved_by);
alter table public.page_revisions enable row level security;

drop policy if exists "page_revisions: super admin read" on public.page_revisions;
create policy "page_revisions: super admin read" on public.page_revisions for select to authenticated
  using ((select public.is_super_admin()));

create or replace function public.record_page_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.title, new.content, new.meta_description) is not distinct from
     (old.title, old.content, old.meta_description) then
    return new;
  end if;
  if not exists (select 1 from public.page_revisions r where r.page_id = old.id) then
    insert into public.page_revisions (page_id, title, content, meta_description, saved_by, saved_at)
    values (old.id, old.title, old.content, old.meta_description, old.updated_by, old.updated_at);
  end if;
  insert into public.page_revisions (page_id, title, content, meta_description, saved_by)
  values (new.id, new.title, new.content, new.meta_description, coalesce(auth.uid(), new.updated_by));
  return new;
end;
$$;

drop trigger if exists pages_revision on public.pages;
create trigger pages_revision after update on public.pages
  for each row execute function public.record_page_revision();

-- ---------------------------------------------------------------------------
-- 7. Audit log (item 76): as migration 1, plus an 'update' entry when the
--    content of a page, the settings, a category, a board member or a feature
--    switch changes. The diff lists the changed field names, with old and new
--    values only when they are short (never whole page bodies).
-- ---------------------------------------------------------------------------
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
  file_keys text[] := array['cover_file_id', 'full_pdf_file_id', 'full_docx_file_id',
                            'pdf_file_id', 'docx_file_id', 'photo_file_id',
                            'logo_file_id', 'default_og_image_file_id'];
  fields text[] := '{}';
  changes jsonb := '{}'::jsonb;
begin
  rec_id := coalesce(n ->> 'id', o ->> 'id', n ->> 'key', o ->> 'key');

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

  foreach k in array file_keys loop
    if n ? k and (o ->> k) is not null and (o ->> k) is distinct from (n ->> k) then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
      values (actor, 'file_replace', entity, rec_id,
              jsonb_build_object('field', k, 'from', o -> k, 'to', n -> k));
    end if;
  end loop;

  if entity in ('pages', 'site_settings', 'categories', 'editorial_board_members', 'feature_flags') then
    for k in
      select key from jsonb_each(n)
      where key <> all (file_keys || array['id', 'key', 'version', 'created_at', 'updated_at', 'updated_by',
                                           'sort_order', 'status', 'deleted_at'])
        and (o -> key) is distinct from (n -> key)
      order by key
    loop
      fields := fields || k;
      -- Short values are kept so the log can say "old → new"; long text is not.
      if coalesce(length(o ->> k), 0) <= 120 and coalesce(length(n ->> k), 0) <= 120 then
        changes := changes || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
      end if;
    end loop;
    if cardinality(fields) > 0 then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
      values (actor, 'update', entity, rec_id,
              jsonb_build_object('fields', to_jsonb(fields), 'changes', changes));
    end if;
  end if;

  return new;
end;
$$;

-- Pages were audited only when their content changed; titles count too.
drop trigger if exists pages_audit on public.pages;
create trigger pages_audit after update on public.pages
  for each row execute function public.audit_changes();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.unique_article_slug(text, uuid) from public, anon;
revoke execute on function public.delete_issue_forever(uuid) from public, anon;
grant execute on function public.unique_article_slug(text, uuid) to authenticated;
grant execute on function public.delete_issue_forever(uuid) to authenticated;
revoke execute on function public.record_issue_redirect() from public, anon, authenticated;
revoke execute on function public.record_category_redirect() from public, anon, authenticated;
revoke execute on function public.record_page_revision() from public, anon, authenticated;

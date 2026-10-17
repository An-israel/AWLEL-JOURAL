-- =============================================================================
-- AWLEL core schema
-- Year -> Volume -> Issue -> Articles, plus profiles, categories, editorial
-- board, static pages, settings, contact messages, metrics and audit log.
-- Reversal: supabase/rollbacks/20261017000001_core_schema.down.sql
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('super_admin', 'editor', 'reviewer', 'author');
create type public.publish_status as enum ('draft', 'published');
create type public.citation_style as enum ('apa7', 'mla8');
create type public.metrics_event_type as enum ('view', 'download_pdf', 'download_docx');
create type public.file_role as enum (
  'issue_cover', 'issue_pdf', 'issue_docx', 'article_pdf', 'article_docx',
  'board_photo', 'site_asset'
);

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Columns maintained by the system (search index, counters) that must not
-- count as an edit. Passed to the triggers below as arguments.
create or replace function public.row_changed(old_row jsonb, new_row jsonb, ignored text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (old_row - ignored - 'updated_at' - 'version') is distinct from
         (new_row - ignored - 'updated_at' - 'version')
$$;

-- Timestamps always come from the database clock, never the client (item 96).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.row_changed(to_jsonb(old), to_jsonb(new), coalesce(tg_argv::text[], '{}')) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Optimistic locking (item 36): every real edit bumps `version`. The app
-- updates with `.eq('version', expected)`; zero rows affected means a stale
-- edit ("Someone else edited this").
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.row_changed(to_jsonb(old), to_jsonb(new), coalesce(tg_argv::text[], '{}')) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and role helpers
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email extensions.citext not null,
  role public.user_role not null default 'author',
  affiliation text check (char_length(affiliation) <= 300),
  orcid text check (orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;
create unique index profiles_email_idx on public.profiles (email);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers. SECURITY DEFINER so RLS policies can call them without
-- recursing into the profiles policies; search_path pinned (item 78).
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('super_admin', 'editor') from public.profiles p
     where p.id = auth.uid() and p.is_active),
    false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'super_admin' from public.profiles p
     where p.id = auth.uid() and p.is_active),
    false)
$$;

-- New auth users get a profile. The role comes from app_metadata, which only
-- the service role can set (invitations); self-registration is always author.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when requested in ('super_admin', 'editor', 'reviewer', 'author')
         then requested::public.user_role else 'author' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role/is_active changes: only a Super Admin (or a server context with no
-- end-user JWT, i.e. the service role) may change them, and the last active
-- Super Admin can never be demoted, deactivated or deleted (items 39, 68).
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining int;
begin
  if tg_op = 'UPDATE'
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null
     and not public.is_super_admin() then
    raise exception 'Only a Super Admin can change roles or account status'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Email changes go through Supabase Auth' using errcode = '42501';
  end if;

  if old.role = 'super_admin' and old.is_active and (
       tg_op = 'DELETE'
       or new.role <> 'super_admin'
       or not new.is_active) then
    -- Serialise concurrent demotions so two admins can't demote each other.
    perform pg_advisory_xact_lock(hashtext('awlel:last_super_admin'));
    select count(*) into remaining from public.profiles
      where role = 'super_admin' and is_active and id <> old.id;
    if remaining = 0 then
      raise exception 'There must always be at least one active Super Admin'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update or delete on public.profiles
  for each row execute function public.guard_profile_changes();

-- ---------------------------------------------------------------------------
-- Stored files: one row per uploaded object. Entities point at their current
-- file; older rows for the same entity/role are kept for rollback (section 8).
-- ---------------------------------------------------------------------------
create table public.stored_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('issue-covers', 'published-files', 'site-assets')),
  path text not null,
  original_name text not null check (char_length(original_name) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  file_role public.file_role not null,
  entity_id uuid,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index stored_files_entity_idx on public.stored_files (entity_id, file_role, created_at desc);
create index stored_files_uploaded_by_idx on public.stored_files (uploaded_by);

-- ---------------------------------------------------------------------------
-- Volumes and issues
-- ---------------------------------------------------------------------------
create table public.volumes (
  id uuid primary key default gen_random_uuid(),
  volume_number int not null unique check (volume_number > 0),
  year int not null check (year between 1990 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index volumes_year_idx on public.volumes (year desc);
create trigger volumes_updated_at before update on public.volumes
  for each row execute function public.set_updated_at();
create trigger volumes_version before update on public.volumes
  for each row execute function public.bump_version();

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  volume_id uuid not null references public.volumes (id) on delete restrict,
  issue_number int not null default 1 check (issue_number > 0),
  month smallint check (month between 1 and 12),
  legacy_number int check (legacy_number > 0),
  title text check (char_length(title) <= 300),
  editorial text,
  cover_file_id uuid references public.stored_files (id) on delete set null,
  cover_alt text check (char_length(cover_alt) <= 300),
  full_pdf_file_id uuid references public.stored_files (id) on delete set null,
  full_docx_file_id uuid references public.stored_files (id) on delete set null,
  published_at timestamptz,
  status public.publish_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version int not null default 1,
  unique (volume_id, issue_number)
);
create index issues_volume_idx on public.issues (volume_id);
create index issues_status_published_idx on public.issues (status, published_at desc) where deleted_at is null;
create index issues_cover_file_idx on public.issues (cover_file_id);
create index issues_full_pdf_file_idx on public.issues (full_pdf_file_id);
create index issues_full_docx_file_idx on public.issues (full_docx_file_id);
create trigger issues_updated_at before update on public.issues
  for each row execute function public.set_updated_at();
create trigger issues_version before update on public.issues
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index categories_sort_idx on public.categories (sort_order) where not is_archived;
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger categories_version before update on public.categories
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Articles and authors
-- ---------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 500),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  abstract text,
  keywords text[] not null default '{}',
  first_page int check (first_page > 0),
  last_page int,
  doi text check (doi ~* '^10\.\d{4,9}/\S+$'),
  citation_style public.citation_style not null default 'mla8',
  pdf_file_id uuid references public.stored_files (id) on delete set null,
  docx_file_id uuid references public.stored_files (id) on delete set null,
  sort_order int not null default 0,
  status public.publish_status not null default 'draft',
  published_at timestamptz,
  -- Denormalised counters, kept current by the metrics rollup (item 61).
  view_count bigint not null default 0,
  download_pdf_count bigint not null default 0,
  download_docx_count bigint not null default 0,
  -- Maintained by trigger (it includes author names from another table, so a
  -- generated column cannot be used).
  search_vector tsvector,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version int not null default 1,
  check (last_page is null or first_page is null or last_page >= first_page)
);
create index articles_issue_idx on public.articles (issue_id, sort_order);
create index articles_category_idx on public.articles (category_id);
create index articles_status_published_idx on public.articles (status, published_at desc) where deleted_at is null;
create index articles_search_idx on public.articles using gin (search_vector);
create index articles_keywords_idx on public.articles using gin (keywords);
create index articles_title_trgm_idx on public.articles using gin (title extensions.gin_trgm_ops);
create index articles_pdf_file_idx on public.articles (pdf_file_id);
create index articles_docx_file_idx on public.articles (docx_file_id);
create index articles_created_by_idx on public.articles (created_by);
create index articles_updated_by_idx on public.articles (updated_by);
create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at('search_vector', 'view_count', 'download_pdf_count', 'download_docx_count');
create trigger articles_version before update on public.articles
  for each row execute function public.bump_version('search_vector', 'view_count', 'download_pdf_count', 'download_docx_count');

create table public.article_authors (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  affiliation text check (char_length(affiliation) <= 300),
  email extensions.citext,
  show_email boolean not null default false,
  orcid text check (orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  position int not null default 0,
  is_corresponding boolean not null default false
);
create index article_authors_article_idx on public.article_authors (article_id, position);
create index article_authors_name_trgm_idx on public.article_authors using gin (full_name extensions.gin_trgm_ops);

-- Old slugs keep resolving after a rename (section 11).
create table public.slug_redirects (
  old_slug text primary key,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index slug_redirects_article_idx on public.slug_redirects (article_id);

create or replace function public.record_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.slug_redirects (old_slug, article_id)
    values (old.slug, old.id)
    on conflict (old_slug) do update set article_id = excluded.article_id;
    -- A slug that is in use again must not also redirect elsewhere.
    delete from public.slug_redirects where old_slug = new.slug;
  end if;
  return new;
end;
$$;
create trigger articles_slug_redirect after update of slug on public.articles
  for each row execute function public.record_slug_redirect();

-- Full-text search vector: title (A), authors + keywords (B), abstract (C).
create or replace function public.article_search_document(p_article_id uuid)
returns tsvector
language sql
stable
set search_path = ''
as $$
  select
    setweight(to_tsvector('english', extensions.unaccent(coalesce(a.title, ''))), 'A')
    || setweight(to_tsvector('english', extensions.unaccent(coalesce(
         (select string_agg(aa.full_name, ' ') from public.article_authors aa where aa.article_id = a.id), ''))), 'B')
    || setweight(to_tsvector('english', extensions.unaccent(array_to_string(a.keywords, ' '))), 'B')
    || setweight(to_tsvector('english', extensions.unaccent(
         regexp_replace(coalesce(a.abstract, ''), '<[^>]+>', ' ', 'g'))), 'C')
  from public.articles a
  where a.id = p_article_id
$$;

create or replace function public.refresh_article_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if tg_table_name = 'articles' then
    target := new.id;
  elsif tg_op = 'DELETE' then
    target := old.article_id;
  else
    target := new.article_id;
  end if;
  update public.articles
    set search_vector = public.article_search_document(target)
    where id = target
      and search_vector is distinct from public.article_search_document(target);
  return null;
end;
$$;

create trigger articles_search_refresh
  after insert or update of title, abstract, keywords on public.articles
  for each row execute function public.refresh_article_search();
create trigger article_authors_search_refresh
  after insert or update or delete on public.article_authors
  for each row execute function public.refresh_article_search();

-- ---------------------------------------------------------------------------
-- Editorial board
-- Groups are a table (not free text on members) so editors can rename and
-- reorder groups such as "Editor", "Editorial Team", "Editorial Consultants".
-- ---------------------------------------------------------------------------
create table public.editorial_board_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create trigger editorial_board_groups_updated_at before update on public.editorial_board_groups
  for each row execute function public.set_updated_at();
create trigger editorial_board_groups_version before update on public.editorial_board_groups
  for each row execute function public.bump_version();

create table public.editorial_board_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.editorial_board_groups (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  title text check (char_length(title) <= 200),
  affiliation text check (char_length(affiliation) <= 400),
  photo_file_id uuid references public.stored_files (id) on delete set null,
  sort_order int not null default 0,
  needs_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version int not null default 1
);
create index editorial_board_members_group_idx on public.editorial_board_members (group_id, sort_order) where deleted_at is null;
create index editorial_board_members_photo_idx on public.editorial_board_members (photo_file_id);
create trigger editorial_board_members_updated_at before update on public.editorial_board_members
  for each row execute function public.set_updated_at();
create trigger editorial_board_members_version before update on public.editorial_board_members
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Static pages, department timeline, site settings
-- ---------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  -- Sanitised HTML produced by the rich text editor (item 79).
  content text not null default '',
  meta_description text check (char_length(meta_description) <= 300),
  -- True while the page still contains placeholder text to be replaced.
  needs_review boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index pages_updated_by_idx on public.pages (updated_by);
create trigger pages_updated_at before update on public.pages
  for each row execute function public.set_updated_at();
create trigger pages_version before update on public.pages
  for each row execute function public.bump_version();

create table public.department_milestones (
  id uuid primary key default gen_random_uuid(),
  year_label text not null check (char_length(year_label) between 1 and 40),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  sort_order int not null default 0,
  needs_verification boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create trigger department_milestones_updated_at before update on public.department_milestones
  for each row execute function public.set_updated_at();
create trigger department_milestones_version before update on public.department_milestones
  for each row execute function public.bump_version();

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  journal_name text not null,
  journal_short_name text not null default 'AWLEL',
  subtitle text not null,
  issn text not null check (issn ~ '^\d{4}-\d{3}[\dX]$'),
  publisher text not null,
  contact_email extensions.citext not null,
  postal_address text,
  publication_frequency text,
  social_links jsonb not null default '{}'::jsonb,
  logo_file_id uuid references public.stored_files (id) on delete set null,
  default_og_image_file_id uuid references public.stored_files (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();
create trigger site_settings_version before update on public.site_settings
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Contact messages
-- ---------------------------------------------------------------------------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email extensions.citext not null check (char_length(email) <= 320),
  subject text not null check (char_length(subject) between 1 and 300),
  message text not null check (char_length(message) between 1 and 10000),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index contact_messages_inbox_idx on public.contact_messages (is_read, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Metrics (no personal data: only a salted hash of a session id)
-- ---------------------------------------------------------------------------
create table public.metrics_events (
  id bigint generated always as identity primary key,
  article_id uuid references public.articles (id) on delete cascade,
  issue_id uuid references public.issues (id) on delete cascade,
  event_type public.metrics_event_type not null,
  session_hash text not null check (char_length(session_hash) between 16 and 128),
  event_day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  check (article_id is not null or issue_id is not null),
  -- De-duplication (item 14): one event of each type per session per day.
  unique nulls not distinct (article_id, issue_id, event_type, session_hash, event_day)
);
create index metrics_events_article_idx on public.metrics_events (article_id, created_at);
create index metrics_events_issue_idx on public.metrics_events (issue_id, created_at);
create index metrics_events_created_idx on public.metrics_events (created_at);

-- Daily rollup. Raw events are kept 13 months, rollups forever (item 31).
create table public.metrics_daily (
  day date not null,
  article_id uuid references public.articles (id) on delete cascade,
  issue_id uuid references public.issues (id) on delete cascade,
  event_type public.metrics_event_type not null,
  event_count bigint not null default 0,
  unique nulls not distinct (day, article_id, issue_id, event_type)
);
create index metrics_daily_article_idx on public.metrics_daily (article_id, day);
create index metrics_daily_issue_idx on public.metrics_daily (issue_id, day);
create index metrics_daily_day_idx on public.metrics_daily (day);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- Records publish/unpublish, soft delete/restore, hard delete, role and
-- account changes, and file replacements. Runs as definer so writers never
-- need (or get) insert rights on audit_log itself.
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

create trigger issues_audit after insert or update or delete on public.issues
  for each row execute function public.audit_changes();
create trigger articles_audit after insert or update or delete on public.articles
  for each row execute function public.audit_changes();
create trigger categories_audit after update or delete on public.categories
  for each row execute function public.audit_changes();
create trigger volumes_audit after delete on public.volumes
  for each row execute function public.audit_changes();
create trigger profiles_audit after update or delete on public.profiles
  for each row execute function public.audit_changes();
create trigger editorial_board_members_audit after update or delete on public.editorial_board_members
  for each row execute function public.audit_changes();
create trigger pages_audit after update of content on public.pages
  for each row execute function public.audit_changes();
create trigger site_settings_audit after update on public.site_settings
  for each row execute function public.audit_changes();
create trigger contact_messages_audit after update of deleted_at or delete on public.contact_messages
  for each row execute function public.audit_changes();

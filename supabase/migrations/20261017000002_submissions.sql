-- =============================================================================
-- Submission and review workflow (section 7)
-- Reversal: supabase/rollbacks/20261017000002_submissions.down.sql
-- =============================================================================

create type public.submission_status as enum (
  'submitted', 'under_screening', 'under_review', 'revisions_requested',
  'accepted', 'rejected', 'published'
);
create type public.submission_file_kind as enum ('original', 'revision', 'reviewer_annotated');
create type public.review_status as enum ('pending', 'submitted', 'withdrawn');
create type public.review_recommendation as enum (
  'accept', 'minor_revisions', 'major_revisions', 'reject'
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  abstract text not null,
  keywords text[] not null default '{}',
  category_id uuid references public.categories (id) on delete set null,
  citation_style public.citation_style not null,
  cover_letter text,
  declarations jsonb not null default '{}'::jsonb,
  status public.submission_status not null default 'submitted',
  -- Client-generated key; a double click or retry returns the same row (item 14).
  idempotency_key uuid not null,
  article_id uuid references public.articles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version int not null default 1,
  unique (author_id, idempotency_key)
);
create index submissions_author_idx on public.submissions (author_id, created_at desc);
create index submissions_status_idx on public.submissions (status, created_at desc) where deleted_at is null;
create index submissions_category_idx on public.submissions (category_id);
create index submissions_article_idx on public.submissions (article_id);
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
create trigger submissions_version before update on public.submissions
  for each row execute function public.bump_version();
create trigger submissions_audit after update or delete on public.submissions
  for each row execute function public.audit_changes();

alter table public.articles
  add column submission_id uuid references public.submissions (id) on delete set null;
create index articles_submission_idx on public.articles (submission_id);

create table public.submission_authors (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  affiliation text check (char_length(affiliation) <= 300),
  email extensions.citext,
  orcid text check (orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  position int not null default 0,
  is_corresponding boolean not null default false
);
create index submission_authors_submission_idx on public.submission_authors (submission_id, position);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  -- Object path inside the private `submissions` bucket: <submission_id>/<uuid>-<name>
  path text not null unique,
  original_name text not null check (char_length(original_name) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  kind public.submission_file_kind not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  check (path like submission_id::text || '/%')
);
create index submission_files_submission_idx on public.submission_files (submission_id, created_at);
create index submission_files_uploaded_by_idx on public.submission_files (uploaded_by);

-- Status history. `message` is shown to the author only when visible_to_author.
create table public.submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  from_status public.submission_status,
  to_status public.submission_status not null,
  message text,
  visible_to_author boolean not null default true,
  created_at timestamptz not null default now()
);
create index submission_events_submission_idx on public.submission_events (submission_id, created_at);
create index submission_events_actor_idx on public.submission_events (actor_id);

create table public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  due_date date,
  status public.review_status not null default 'pending',
  recommendation public.review_recommendation,
  comments text,
  annotated_file_id uuid references public.submission_files (id) on delete set null,
  submitted_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (submission_id, reviewer_id),
  check (status <> 'submitted' or (recommendation is not null and submitted_at is not null))
);
create index review_assignments_reviewer_idx on public.review_assignments (reviewer_id, status);
create index review_assignments_due_idx on public.review_assignments (due_date) where status = 'pending';
create index review_assignments_assigned_by_idx on public.review_assignments (assigned_by);
create index review_assignments_annotated_idx on public.review_assignments (annotated_file_id);
create trigger review_assignments_updated_at before update on public.review_assignments
  for each row execute function public.set_updated_at();
create trigger review_assignments_version before update on public.review_assignments
  for each row execute function public.bump_version();

-- Status changes are always written to the history in the same transaction.
create or replace function public.log_submission_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.submission_events (submission_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.submission_events (submission_id, actor_id, from_status, to_status, message, visible_to_author)
    values (new.id, auth.uid(), old.status, new.status,
            nullif(current_setting('awlel.status_message', true), ''),
            coalesce(nullif(current_setting('awlel.status_message_visible', true), '')::boolean, true));
  end if;
  return null;
end;
$$;
create trigger submissions_status_log after insert or update of status on public.submissions
  for each row execute function public.log_submission_status();

-- Authors may only touch their own drafts' metadata while the editors have
-- not started; status is never author-editable. Reviewers may only write
-- their own review fields, and never after submitting.
create or replace function public.guard_submission_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.author_id is distinct from old.author_id
     or new.article_id is distinct from old.article_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Not allowed to change these submission fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger submissions_guard before update on public.submissions
  for each row execute function public.guard_submission_changes();

create or replace function public.guard_review_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'This review has already been submitted' using errcode = '42501';
  end if;
  if new.submission_id is distinct from old.submission_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.assigned_by is distinct from old.assigned_by
     or new.due_date is distinct from old.due_date
     or new.status not in ('pending', 'submitted') then
    raise exception 'Reviewers may only edit their own review' using errcode = '42501';
  end if;
  if new.status = 'submitted' then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
create trigger review_assignments_guard before update on public.review_assignments
  for each row execute function public.guard_review_changes();

-- Helpers for RLS (definer: they read tables the caller may not see directly).
create or replace function public.is_submission_author(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.submissions s
                 where s.id = p_submission_id and s.author_id = auth.uid())
$$;

create or replace function public.is_assigned_reviewer(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.review_assignments r
                 join public.profiles p on p.id = r.reviewer_id and p.is_active
                 where r.submission_id = p_submission_id
                   and r.reviewer_id = auth.uid()
                   and r.status <> 'withdrawn')
$$;

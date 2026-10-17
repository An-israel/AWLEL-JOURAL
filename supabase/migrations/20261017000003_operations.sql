-- =============================================================================
-- Operational tables: domain events, job queue + dead letters, feature flags,
-- rate limiting, schema version. The workers and cron that consume these are
-- built in milestone 8; the tables exist now so features can enqueue work.
-- Reversal: supabase/rollbacks/20261017000003_operations.down.sql
-- =============================================================================

create type public.job_status as enum ('queued', 'running', 'succeeded');

-- Domain events (item 17): submission.created, review.submitted, ...
create table public.domain_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index domain_events_created_idx on public.domain_events (created_at desc);
create index domain_events_aggregate_idx on public.domain_events (aggregate_type, aggregate_id);
create index domain_events_actor_idx on public.domain_events (actor_id);

-- Job queue (item 15). Workers claim with FOR UPDATE SKIP LOCKED (item 37).
create table public.jobs (
  id bigint generated always as identity primary key,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  -- Same key twice = same job (item 14).
  idempotency_key text unique,
  status public.job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 6 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  source_event_id bigint references public.domain_events (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (run_at) where status = 'queued';
create index jobs_running_idx on public.jobs (locked_at) where status = 'running';
create index jobs_source_event_idx on public.jobs (source_event_id);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Dead letters (item 20): jobs that exhausted their retries.
create table public.dead_letter_jobs (
  id bigint generated always as identity primary key,
  original_job_id bigint not null,
  job_type text not null,
  payload jsonb not null,
  idempotency_key text,
  attempts int not null,
  last_error text,
  failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('retried', 'discarded'))
);
create index dead_letter_jobs_open_idx on public.dead_letter_jobs (failed_at desc) where resolved_at is null;

-- Feature flags (item 51).
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  enabled boolean not null default false,
  description text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index feature_flags_updated_by_idx on public.feature_flags (updated_by);
create trigger feature_flags_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();
create trigger feature_flags_audit after update on public.feature_flags
  for each row execute function public.audit_changes();

-- Postgres-backed fixed-window rate limiter (item 1). Keys are hashed by the
-- app (never raw IPs or emails).
create unlogged table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  win_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits int;
begin
  -- Atomic upsert: concurrent requests can't both slip under the limit (item 39).
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, win_start, 1)
  on conflict (key) do update
    set hits = case when rl.window_start = excluded.window_start then rl.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning rl.hits into current_hits;

  allowed := current_hits <= p_limit;
  remaining := greatest(p_limit - current_hits, 0);
  retry_after_seconds := case when allowed then 0
    else ceil(extract(epoch from (win_start + make_interval(secs => p_window_seconds) - now())))::int end;
  return next;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- Current schema version for the admin Settings page (item 82).
create or replace function public.schema_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if not (public.is_staff() or auth.uid() is null) then
    return null;
  end if;
  select max(version) into v from supabase_migrations.schema_migrations;
  return v;
exception when undefined_table then
  return null;
end;
$$;

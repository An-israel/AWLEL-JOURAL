-- =============================================================================
-- Reliability and operations (milestone 8): the queue worker's SQL side,
-- cron leases and run history, the email circuit breaker, bounce suppression,
-- review reminders, orphaned-file detection, error counts and realtime staff
-- notices.
-- Reversal: supabase/rollbacks/20261017000010_operations_worker.down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Job queue worker (items 12, 15, 20, 37, 96). Timestamps come from the
-- database clock, never the function's.
-- ---------------------------------------------------------------------------

-- Claims up to p_limit ready jobs. SKIP LOCKED lets several workers (cron,
-- inline attempts) run side by side without taking the same job (item 37).
create or replace function public.claim_jobs(p_worker text, p_limit int default 10)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j
  set status = 'running', locked_at = now(), locked_by = p_worker
  where j.id in (
    select q.id from public.jobs q
    where q.status = 'queued' and q.run_at <= now()
    order by q.run_at, q.id
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  )
  returning j.*;
$$;

-- Claims one specific job (the inline attempt right after enqueueing).
create or replace function public.claim_job(p_id bigint, p_worker text)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j
  set status = 'running', locked_at = now(), locked_by = p_worker
  where j.id = (select q.id from public.jobs q where q.id = p_id and q.status = 'queued' for update skip locked)
  returning j.*;
$$;

create or replace function public.finish_job(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jobs set status = 'succeeded', locked_at = null, locked_by = null, last_error = null
  where id = p_id;
$$;

-- Records a failed attempt. Retries after p_retry_in_ms (exponential backoff
-- with jitter, computed by the app), or moves the job to the dead letters
-- when it can't succeed or has run out of attempts. Returns 'retry' or 'dead'.
create or replace function public.fail_job(p_id bigint, p_error text, p_retryable boolean, p_retry_in_ms int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_id for update;
  if not found then
    return 'dead';
  end if;
  if not p_retryable or j.attempts + 1 >= j.max_attempts then
    insert into public.dead_letter_jobs (original_job_id, job_type, payload, idempotency_key, attempts, last_error)
    values (j.id, j.job_type, j.payload, j.idempotency_key, j.attempts + 1, left(p_error, 2000));
    delete from public.jobs where id = p_id;
    return 'dead';
  end if;
  update public.jobs set
    status = 'queued',
    attempts = j.attempts + 1,
    last_error = left(p_error, 2000),
    locked_at = null,
    locked_by = null,
    run_at = now() + make_interval(secs => greatest(p_retry_in_ms, 0) / 1000.0)
  where id = p_id;
  return 'retry';
end;
$$;

-- Puts a claimed job back without counting an attempt: used when the
-- provider's circuit is open, so an outage doesn't burn through retries.
create or replace function public.defer_job(p_id bigint, p_retry_in_ms int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jobs set status = 'queued', locked_at = null, locked_by = null,
    run_at = now() + make_interval(secs => greatest(p_retry_in_ms, 0) / 1000.0)
  where id = p_id;
$$;

-- A worker that died mid-job leaves it "running"; put it back in the queue
-- (counting the attempt) once its lock is older than the function timeout.
create or replace function public.release_stale_jobs(p_older_than_seconds int default 900)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.jobs set
    status = 'queued',
    attempts = attempts + 1,
    locked_at = null,
    locked_by = null,
    last_error = coalesce(last_error || ' · ', '') || 'worker stopped before finishing'
  where status = 'running' and locked_at < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Super Admin: send a dead letter back to the queue, or discard it.
create or replace function public.resolve_dead_letter(p_id bigint, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dead_letter_jobs;
begin
  if not public.is_super_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_action not in ('retried', 'discarded') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  select * into d from public.dead_letter_jobs where id = p_id and resolved_at is null for update;
  if not found then
    raise exception 'Already resolved.' using errcode = 'AW409';
  end if;
  if p_action = 'retried' then
    -- Same idempotency key: the provider still ignores a send that did go out.
    insert into public.jobs (job_type, payload, idempotency_key)
    values (d.job_type, d.payload, d.idempotency_key)
    on conflict (idempotency_key) do update set status = 'queued', attempts = 0, run_at = now(),
      locked_at = null, locked_by = null;
  end if;
  update public.dead_letter_jobs set resolved_at = now(), resolution = p_action where id = p_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'dead_letter_' || p_action, 'dead_letter_jobs', p_id::text,
          jsonb_build_object('job_type', d.job_type));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cron (items 21, 38): a lease is a distributed lock with a time limit, so
-- overlapping invocations never run the same task twice and a crashed run
-- can't hold the lock forever. Every run is recorded for monitoring.
-- ---------------------------------------------------------------------------
create table public.cron_leases (
  name text primary key,
  holder text not null,
  locked_until timestamptz not null
);

create table public.cron_runs (
  id bigint generated always as identity primary key,
  task text not null check (task ~ '^[a-z][a-z0-9_]*$'),
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  error text
);
create index cron_runs_task_idx on public.cron_runs (task, started_at desc);

create or replace function public.cron_acquire(p_name text, p_holder text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.cron_leases as l (name, holder, locked_until)
  values (p_name, p_holder, now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update set holder = excluded.holder, locked_until = excluded.locked_until
    where l.locked_until < now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.cron_release(p_name text, p_holder text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.cron_leases where name = p_name and holder = p_holder;
$$;

-- ---------------------------------------------------------------------------
-- Circuit breaker (item 10). After p_threshold failures in a row the circuit
-- opens for p_open_seconds: callers leave work queued instead of hammering a
-- provider that is down. The first call after that is the trial ("half
-- open"); one more failure re-opens it at once.
-- ---------------------------------------------------------------------------
create table public.circuit_breakers (
  name text primary key,
  failures int not null default 0,
  opened_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.breaker_allows(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select opened_until is null or opened_until <= now()
                   from public.circuit_breakers where name = p_name), true);
$$;

create or replace function public.breaker_record(p_name text, p_ok boolean, p_threshold int default 5,
                                                 p_open_seconds int default 300)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    insert into public.circuit_breakers as b (name, failures, opened_until)
    values (p_name, 0, null)
    on conflict (name) do update set failures = 0, opened_until = null, updated_at = now()
      where b.failures <> 0 or b.opened_until is not null;
  else
    insert into public.circuit_breakers as b (name, failures, opened_until)
    values (p_name, 1, case when p_threshold <= 1 then now() + make_interval(secs => p_open_seconds) end)
    on conflict (name) do update set
      failures = b.failures + 1,
      opened_until = case when b.failures + 1 >= p_threshold
                          then now() + make_interval(secs => p_open_seconds) else b.opened_until end,
      updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Error rate (items 61, 62): server errors counted per minute, so the alert
-- check can spot a spike without an external metrics service.
-- ---------------------------------------------------------------------------
create table public.error_counts (
  minute timestamptz primary key,
  errors int not null default 0
);

create or replace function public.record_app_error()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.error_counts as e (minute, errors) values (date_trunc('minute', now()), 1)
  on conflict (minute) do update set errors = e.errors + 1;
$$;

create or replace function public.errors_since(p_minutes int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(errors), 0)::int from public.error_counts
  where minute >= now() - make_interval(mins => p_minutes);
$$;

-- ---------------------------------------------------------------------------
-- Email webhooks (item 101): bounced and complaining addresses are not
-- emailed again; webhook deliveries are processed once.
-- ---------------------------------------------------------------------------
create table public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('bounced', 'complained')),
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id text primary key,
  source text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Review reminders (item 21): pending reviews due within 3 days or overdue,
-- at most one reminder every 3 days per review.
-- ---------------------------------------------------------------------------
create or replace function public.due_review_reminders()
returns table (assignment_id uuid, reviewer_email text, reviewer_name text, due_date date, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.email, p.full_name, r.due_date, s.title
  from public.review_assignments r
  join public.profiles p on p.id = r.reviewer_id and p.is_active
  join public.submissions s on s.id = r.submission_id and s.deleted_at is null
  where r.status = 'pending'
    and r.due_date is not null
    and r.due_date <= (now() at time zone 'utc')::date + 3
    and (r.reminder_sent_at is null or r.reminder_sent_at < now() - interval '3 days')
  order by r.due_date
  limit 200
$$;

-- ---------------------------------------------------------------------------
-- Orphaned files (item 19): objects in storage with no database row, left by
-- an upload that was abandoned after the signed URL was issued. The cleanup
-- deletes them through the Storage API, never with SQL.
-- ---------------------------------------------------------------------------
create or replace function public.orphaned_objects(p_older_than_hours int default 24, p_limit int default 500)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('issue-covers', 'site-assets', 'published-files', 'submissions')
    and o.created_at < now() - make_interval(hours => p_older_than_hours)
    and not exists (select 1 from public.stored_files f where f.bucket = o.bucket_id and f.path = o.name)
    and not exists (select 1 from public.submission_files sf where o.bucket_id = 'submissions' and sf.path = o.name)
  order by o.created_at
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- Live notices (items 16, 22): staff subscribe to new workflow events over
-- Supabase Realtime. RLS decides who receives what, as for any select.
-- ---------------------------------------------------------------------------
create policy "domain_events: staff read workflow events" on public.domain_events for select to authenticated
  using ((select public.is_staff()) and split_part(event_type, '.', 1) in ('submission', 'review', 'contact'));
alter publication supabase_realtime add table public.domain_events;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.cron_leases enable row level security;
alter table public.cron_runs enable row level security;
alter table public.circuit_breakers enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.error_counts enable row level security;

create policy "cron_runs: super admin read" on public.cron_runs for select to authenticated
  using ((select public.is_super_admin()));
create policy "circuit_breakers: super admin read" on public.circuit_breakers for select to authenticated
  using ((select public.is_super_admin()));
create policy "email_suppressions: super admin read" on public.email_suppressions for select to authenticated
  using ((select public.is_super_admin()));
create policy "email_suppressions: super admin delete" on public.email_suppressions for delete to authenticated
  using ((select public.is_super_admin()));

do $$
declare
  f text;
begin
  foreach f in array array[
    'claim_jobs(text, int)', 'claim_job(bigint, text)', 'finish_job(bigint)',
    'fail_job(bigint, text, boolean, int)', 'defer_job(bigint, int)', 'release_stale_jobs(int)',
    'cron_acquire(text, text, int)', 'cron_release(text, text)',
    'breaker_allows(text)', 'breaker_record(text, boolean, int, int)',
    'due_review_reminders()', 'orphaned_objects(int, int)', 'record_app_error()', 'errors_since(int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.resolve_dead_letter(bigint, text) from public, anon;
grant execute on function public.resolve_dead_letter(bigint, text) to authenticated;

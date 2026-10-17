-- Reverses 20261017000003_operations.sql. Destroys queue, flags and rate-limit data.
drop function if exists public.schema_version();
drop function if exists public.check_rate_limit(text, int, int);
drop table if exists public.rate_limits;
drop table if exists public.feature_flags;
drop table if exists public.dead_letter_jobs;
drop table if exists public.jobs;
drop table if exists public.domain_events;
drop type if exists public.job_status;

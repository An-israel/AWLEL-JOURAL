-- pgTAP: queue worker functions, cron leases, circuit breaker, dead letters,
-- realtime visibility. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

delete from public.jobs;
insert into public.jobs (id, job_type, payload, idempotency_key, max_attempts, run_at)
overriding system value values
  (9001, 'email.send', '{"to":"a@t.local"}', 'pgtap:1', 2, now() - interval '1 minute'),
  (9002, 'email.send', '{"to":"b@t.local"}', 'pgtap:2', 6, now() - interval '1 minute'),
  (9003, 'email.send', '{"to":"c@t.local"}', 'pgtap:3', 6, now() + interval '1 hour');

-- Claiming (item 37)
select is((select count(*)::int from public.claim_jobs('w1', 10)), 2, 'only ready jobs are claimed');
select is((select count(*)::int from public.claim_jobs('w2', 10)), 0, 'claimed jobs are not handed out twice');
select is((select locked_by from public.jobs where id = 9001), 'w1', 'the claim records the worker');

-- Failing: retry with backoff, then dead letter (items 12, 20)
select is(public.fail_job(9001, 'Resend responded 503', true, 60000), 'retry', 'a retryable failure is retried');
select ok((select run_at > now() + interval '50 seconds' and status = 'queued' and attempts = 1 from public.jobs where id = 9001),
  'the retry waits for the backoff delay');
update public.jobs set run_at = now() where id = 9001;
select is((select count(*)::int from public.claim_jobs('w1', 10)), 1, 'the retried job can be claimed again');
select is(public.fail_job(9001, 'Resend responded 503', true, 60000), 'dead', 'the last attempt moves the job to dead letters');
select ok(not exists (select 1 from public.jobs where id = 9001), 'the dead job leaves the queue');
select is((select attempts from public.dead_letter_jobs where original_job_id = 9001), 2, 'the dead letter keeps the attempt count');
select is(public.fail_job(9002, 'Resend responded 422', false, 0), 'dead', 'a permanent failure dead-letters at once');

-- Deferring (circuit open) does not use up attempts
insert into public.jobs (id, job_type, idempotency_key, status, attempts, locked_at) overriding system value
values (9004, 'email.send', 'pgtap:4', 'running', 1, now());
select public.defer_job(9004, 300000);
select ok((select status = 'queued' and attempts = 1 and run_at > now() from public.jobs where id = 9004),
  'a deferred job keeps its attempts and waits');

-- Stale jobs from a crashed worker go back to the queue
update public.jobs set status = 'running', locked_at = now() - interval '1 hour' where id = 9003;
select is(public.release_stale_jobs(900), 1, 'stale running jobs are released');

-- Cron leases (item 38)
select ok(public.cron_acquire('pgtap', 'a', 60), 'a free lease is acquired');
select ok(not public.cron_acquire('pgtap', 'b', 60), 'a held lease is refused');
select public.cron_release('pgtap', 'a');
select ok(public.cron_acquire('pgtap', 'b', 60), 'a released lease can be taken');

-- Circuit breaker (item 10)
select public.breaker_record('pgtap', false, 3, 300) from generate_series(1, 2);
select ok(public.breaker_allows('pgtap'), 'below the threshold the circuit stays closed');
select public.breaker_record('pgtap', false, 3, 300);
select ok(not public.breaker_allows('pgtap'), 'the third failure opens the circuit');
select public.breaker_record('pgtap', true);
select ok(public.breaker_allows('pgtap'), 'a success closes it again');

-- Only the Super Admin resolves dead letters; editors see workflow events but not user events
insert into auth.users (id, email, aud, role) values
  ('e1111111-1111-4111-8111-111111111111', 'ed-ops@t.local', 'authenticated', 'authenticated');
update public.profiles set role = 'editor' where id = 'e1111111-1111-4111-8111-111111111111';
insert into public.domain_events (event_type, aggregate_type, aggregate_id) values
  ('submission.created', 'submission', 'x'), ('user.invited', 'user', 'y');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.resolve_dead_letter((select id from public.dead_letter_jobs limit 1), 'retried') $$,
  '42501', null, 'editors cannot resolve dead letters');
select is((select array_agg(event_type order by event_type) from public.domain_events where aggregate_id in ('x', 'y')),
  array['submission.created'], 'editors receive workflow events only');

select * from finish();
rollback;

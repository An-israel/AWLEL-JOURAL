-- pgTAP: view/download recording, rollup and dashboard queries. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.volumes (id, volume_number, year) values ('c1111111-1111-4111-8111-111111111111', 9901, 2099);
insert into public.issues (id, volume_id, issue_number, status) values
  ('c2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', 1, 'published'),
  ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 2, 'draft');
insert into public.articles (id, issue_id, title, slug, status) values
  ('d1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'Counted', 'pgtap-counted', 'published'),
  ('d2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333', 'Hidden', 'pgtap-hidden', 'published');

select ok(public.record_metric_event('view', repeat('a', 64), 'd1111111-1111-4111-8111-111111111111'),
  'a first view is recorded');
select ok(not public.record_metric_event('view', repeat('a', 64), 'd1111111-1111-4111-8111-111111111111'),
  'the same visitor on the same day is not counted twice');
select ok(public.record_metric_event('view', repeat('b', 64), 'd1111111-1111-4111-8111-111111111111'),
  'another visitor is counted');
select ok(public.record_metric_event('download_pdf', repeat('a', 64), 'd1111111-1111-4111-8111-111111111111'),
  'a download is recorded separately from the view');
select is((select row(view_count, download_pdf_count, download_count)::text from public.articles
           where id = 'd1111111-1111-4111-8111-111111111111'), '(2,1,1)',
  'the article counters move at once');
select ok(not public.record_metric_event('view', repeat('a', 64), 'd2222222-2222-4222-8222-222222222222'),
  'articles in an unpublished issue are not counted');
select ok(public.record_metric_event('download_pdf', repeat('a', 64), null, 'c2222222-2222-4222-8222-222222222222'),
  'full-issue downloads are recorded');
select throws_ok($$ select public.record_metric_event('view', repeat('a', 64)) $$, '22023', null,
  'an event needs an article or an issue');

-- Yesterday's events, so the rollup has a finished day to roll up.
insert into public.metrics_events (article_id, event_type, session_hash, event_day)
values ('d1111111-1111-4111-8111-111111111111', 'view', repeat('c', 64), (now() at time zone 'utc')::date - 1),
       ('d1111111-1111-4111-8111-111111111111', 'view', repeat('d', 64), (now() at time zone 'utc')::date - 1);
select ok(public.rollup_metrics() >= 1, 'the rollup writes daily rows');
select is((select event_count from public.metrics_daily
           where article_id = 'd1111111-1111-4111-8111-111111111111' and day = (now() at time zone 'utc')::date - 1),
  2::bigint, 'yesterday is rolled up');
select lives_ok($$ select public.rollup_metrics() $$, 'the rollup can run again safely');

-- The dashboard series mixes rolled-up days and today's raw events.
select is((select sum(views)::int from public.metrics_timeseries((now() at time zone 'utc')::date - 1,
           (now() at time zone 'utc')::date, 'd1111111-1111-4111-8111-111111111111')), 4,
  'views over yesterday and today: 2 rolled up + 2 raw');

-- Visitors can't call the recorder or read the numbers.
set local role anon;
select throws_ok($$ select public.record_metric_event('view', repeat('e', 64), 'd1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'the public cannot record events directly');

select * from finish();
rollback;

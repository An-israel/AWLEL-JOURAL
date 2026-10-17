-- pgTAP: review workflow functions and blinding. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('a1111111-1111-4111-8111-111111111111', 'ed@t.local', 'authenticated', 'authenticated'),
  ('a2222222-2222-4222-8222-222222222222', 'rev@t.local', 'authenticated', 'authenticated'),
  ('a3333333-3333-4333-8333-333333333333', 'au@t.local', 'authenticated', 'authenticated');
update public.profiles set role = 'editor' where id = 'a1111111-1111-4111-8111-111111111111';
update public.profiles set role = 'reviewer' where id = 'a2222222-2222-4222-8222-222222222222';
update public.profiles set full_name = 'Secret Author Name' where id = 'a3333333-3333-4333-8333-333333333333';

insert into public.submissions (id, author_id, title, abstract, citation_style, idempotency_key, cover_letter)
values ('b1111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333', 'Blind Paper', 'Abstract', 'mla8', gen_random_uuid(), 'Dear editor, I am Secret Author Name');
insert into public.submission_authors (submission_id, full_name, email, position)
values ('b1111111-1111-4111-8111-111111111111', 'Co Author Hidden', 'hidden@t.local', 0);
insert into public.review_assignments (submission_id, reviewer_id)
values ('b1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Editor changes status with a message for the author.
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select is(public.change_submission_status('b1111111-1111-4111-8111-111111111111', 1, 'under_review', 'Sent to two reviewers.', true), 2,
  'status change bumps the version');
select throws_ok($$ select public.change_submission_status('b1111111-1111-4111-8111-111111111111', 1, 'accepted', null, true) $$,
  'AW409', null, 'a stale status change is refused');

-- Author sees the message on their timeline.
select pg_temp.login('a3333333-3333-4333-8333-333333333333');
select is((select message from public.submission_events where to_status = 'under_review'), 'Sent to two reviewers.',
  'author sees the message from the editor');
select throws_ok($$ select public.change_submission_status('b1111111-1111-4111-8111-111111111111', 2, 'accepted', null, true) $$,
  null, null, 'authors cannot change status, even through the function');

select is((select status::text from public.submissions where id = 'b1111111-1111-4111-8111-111111111111'), 'under_review',
  'the status is unchanged after the author tried');

-- Reviewer queue is blinded.
select pg_temp.login('a2222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.reviewer_queue()), 1, 'reviewer sees their assignment');
select is((select title from public.reviewer_queue()), 'Blind Paper', 'reviewer sees the title');
select ok(not exists (select 1 from public.reviewer_queue() q where row_to_json(q)::text like '%Secret Author%' or row_to_json(q)::text like '%Hidden%'),
  'reviewer queue carries no author identity or cover letter');

-- A stranger sees nothing.
select pg_temp.login('a3333333-3333-4333-8333-333333333333');
select is((select count(*)::int from public.reviewer_queue()), 0, 'non-reviewers get an empty queue');

select * from finish();
rollback;

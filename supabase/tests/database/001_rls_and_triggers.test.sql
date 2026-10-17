-- pgTAP tests for permissions and integrity rules. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Test users ------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'admin@test.local', '{"role":"super_admin"}', '{"full_name":"Admin"}', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'editor@test.local', '{"role":"editor"}', '{"full_name":"Editor"}', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'reviewer@test.local', '{"role":"reviewer"}', '{}', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'author@test.local', '{}', '{}', 'authenticated', 'authenticated'),
  ('55555555-5555-4555-8555-555555555555', 'sneaky@test.local', '{}', '{}', 'authenticated', 'authenticated');

select is((select role::text from public.profiles where email = 'admin@test.local'), 'super_admin',
  'invited role comes from app_metadata');
select is((select role::text from public.profiles where email = 'author@test.local'), 'author',
  'self-registered users are authors');

-- Make the seeded test admin the only super admin for the last-admin checks.
delete from public.profiles where role = 'super_admin' and email <> 'admin@test.local';

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create or replace function pg_temp.reset() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- A draft article that the public must not see.
insert into public.articles (id, issue_id, title, slug, status)
values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000002601',
        'Draft article', 'draft-article', 'draft');
insert into public.article_authors (article_id, full_name, email, show_email, position)
values ('00000000-0000-4000-8000-000000260101', 'Hidden Email', 'hidden@test.local', false, 5),
       ('00000000-0000-4000-8000-000000260101', 'Shown Email', 'shown@test.local', true, 6);

-- Public visibility -----------------------------------------------------------
select pg_temp.anon();
select is((select count(*)::int from public.issues), 1, 'anon sees the published issue');
select is((select count(*)::int from public.articles), 3, 'anon sees only published articles');
select is((select count(*)::int from public.article_authors), 0, 'anon cannot read the authors base table');
select is((select count(*)::int from public.public_article_authors where email is not null), 1,
  'public author view only exposes emails marked show_email');
select is((select count(*)::int from public.profiles), 0, 'anon cannot read profiles');
select is((select count(*)::int from public.categories), 10, 'anon reads categories');
select is((select count(*)::int from public.editorial_board_members), 21, 'anon reads the editorial board');
select throws_ok($$ insert into public.issues (volume_id, issue_number) values ('00000000-0000-4000-8000-000000000026', 9) $$,
  '42501', null, 'anon cannot create issues');
select throws_ok($$ insert into public.contact_messages (name, email, subject, message) values ('a','a@b.c','s','m') $$,
  '42501', null, 'anon cannot write contact messages directly (server inserts after spam checks)');

-- Authors ---------------------------------------------------------------------
select pg_temp.login('44444444-4444-4444-8444-444444444444');
select is((select count(*)::int from public.articles), 3, 'authors do not see drafts');
update public.profiles set full_name = 'Hijacked' where id = '55555555-5555-4555-8555-555555555555';
select pg_temp.reset();
select is((select full_name from public.profiles where id = '55555555-5555-4555-8555-555555555555'), '',
  'RLS: author cannot change another profile');

select pg_temp.login('44444444-4444-4444-8444-444444444444');
select throws_ok($$ update public.profiles set role = 'editor' where id = auth.uid() $$,
  '42501', 'Only a Super Admin can change roles or account status', 'author cannot promote themselves');
select lives_ok($$ insert into public.submissions (id, author_id, title, abstract, citation_style, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'My paper', 'Abstract', 'apa7', gen_random_uuid()) $$,
  'author can submit');
select throws_ok($$ insert into public.submissions (author_id, title, abstract, citation_style, idempotency_key, status)
  values (auth.uid(), 'Sneaky', 'x', 'apa7', gen_random_uuid(), 'accepted') $$,
  '42501', null, 'author cannot submit with a non-initial status');
select throws_ok($$ update public.submissions set status = 'accepted' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'author cannot change submission status');
select is((select count(*)::int from public.submission_events), 1, 'submission history is written automatically');

-- Other authors and reviewers -------------------------------------------------
select pg_temp.login('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from public.submissions), 0, 'authors cannot see other authors'' submissions');

select pg_temp.login('22222222-2222-4222-8222-222222222222');
select lives_ok($$ insert into public.review_assignments (submission_id, reviewer_id, assigned_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', auth.uid()) $$,
  'editor can assign a reviewer');
select is((select count(*)::int from public.articles), 4, 'editor sees drafts');

select pg_temp.login('33333333-3333-4333-8333-333333333333');
select is((select count(*)::int from public.submissions), 0, 'reviewers cannot read submissions directly (blinding)');
select is((select count(*)::int from public.submission_authors), 0, 'reviewers cannot read submission authors');
select is((select count(*)::int from public.review_assignments), 1, 'reviewer sees own assignment');

-- Last Super Admin ------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select throws_ok($$ update public.profiles set role = 'editor' where id = auth.uid() $$,
  'P0001', 'There must always be at least one active Super Admin', 'last super admin cannot be demoted');
select pg_temp.reset();

-- Integrity triggers ----------------------------------------------------------
select ok((select search_vector @@ to_tsquery('english', 'migration') from public.articles
           where id = '00000000-0000-4000-8000-000000260101'), 'search vector indexes title/abstract');
select ok((select search_vector @@ to_tsquery('english', 'okeke') from public.articles
           where id = '00000000-0000-4000-8000-000000260101'), 'search vector indexes author names');

update public.articles set slug = 'renamed-slug' where id = '99999999-9999-4999-8999-999999999999';
select is((select article_id from public.slug_redirects where old_slug = 'draft-article'),
  '99999999-9999-4999-8999-999999999999'::uuid, 'renaming a slug records a redirect');

select * from finish();
rollback;

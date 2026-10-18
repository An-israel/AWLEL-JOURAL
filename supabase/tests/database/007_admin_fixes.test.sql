-- pgTAP: admin dashboard fixes (migration 17). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('a7111111-1111-4111-8111-111111111111', 'admin-fix@t.local', '{"role":"super_admin"}', 'authenticated', 'authenticated'),
  ('a7222222-2222-4222-8222-222222222222', 'editor-fix@t.local', '{"role":"editor"}', 'authenticated', 'authenticated');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create or replace function pg_temp.reset() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create or replace function pg_temp.article_data(p_issue uuid, p_title text, p_slug text, p_date text, p_auto boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('issue_id', p_issue, 'category_id', '', 'title', p_title, 'slug', p_slug,
    'abstract', '', 'keywords', '[]'::jsonb, 'first_page', '', 'last_page', '', 'doi', '',
    'citation_style', 'mla8', 'published_at', p_date, 'auto_slug', p_auto)
$$;

-- Fixtures: a volume with a published issue (one published article, one
-- draft) and an empty draft issue.
insert into public.volumes (id, volume_number, year) values ('a7000000-0000-4000-8000-000000000001', 9917, 2099);
insert into public.issues (id, volume_id, issue_number, status, published_at) values
  ('a7000000-0000-4000-8000-000000000011', 'a7000000-0000-4000-8000-000000000001', 1, 'published', '2099-01-05 09:00+00'),
  ('a7000000-0000-4000-8000-000000000012', 'a7000000-0000-4000-8000-000000000001', 2, 'draft', null);
insert into public.articles (id, issue_id, title, slug, status, published_at, sort_order) values
  ('a7000000-0000-4000-8000-000000000101', 'a7000000-0000-4000-8000-000000000011', 'Live one', 'fix-live-one', 'published', '2099-01-05 09:00+00', 10),
  ('a7000000-0000-4000-8000-000000000102', 'a7000000-0000-4000-8000-000000000011', 'Draft one', 'fix-draft-one', 'draft', null, 20);

select pg_temp.login('a7222222-2222-4222-8222-222222222222');

-- 68: publication dates ---------------------------------------------------------
select save_article.version from public.save_article(
  'a7000000-0000-4000-8000-000000000101',
  (select version from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  pg_temp.article_data('a7000000-0000-4000-8000-000000000011', 'Live one, retitled', 'fix-live-one', ''),
  '[{"full_name":"A. Author"}]');
select is((select published_at from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  '2099-01-05 09:00+00'::timestamptz, 'saving a published article with an empty date keeps its date');
select is((select title from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  'Live one, retitled', 'the rest of the save still applies');

select save_article.version from public.save_article(
  'a7000000-0000-4000-8000-000000000101',
  (select version from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  pg_temp.article_data('a7000000-0000-4000-8000-000000000011', 'Live one, retitled', 'fix-live-one', '2099-02-01T09:00:00Z'),
  '[{"full_name":"A. Author"}]');
select is((select published_at from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  '2099-02-01 09:00+00'::timestamptz, 'an editor can still change the date of a published article');

update public.articles set published_at = null where id = 'a7000000-0000-4000-8000-000000000101';
select isnt((select published_at from public.articles where id = 'a7000000-0000-4000-8000-000000000101'),
  null, 'a direct update cannot clear the date of a published article');

update public.issues set published_at = null where id = 'a7000000-0000-4000-8000-000000000011';
select is((select published_at from public.issues where id = 'a7000000-0000-4000-8000-000000000011'),
  '2099-01-05 09:00+00'::timestamptz, 'saving a published issue with an empty date keeps its date');

update public.articles set published_at = '2099-03-01 09:00+00' where id = 'a7000000-0000-4000-8000-000000000102';
update public.articles set published_at = null where id = 'a7000000-0000-4000-8000-000000000102';
select is((select published_at from public.articles where id = 'a7000000-0000-4000-8000-000000000102'),
  null, 'a draft article''s date can still be cleared');

update public.articles set status = 'published' where id = 'a7000000-0000-4000-8000-000000000102';
select isnt((select published_at from public.articles where id = 'a7000000-0000-4000-8000-000000000102'),
  null, 'publishing without a date sets today''s date');
update public.articles set status = 'draft' where id = 'a7000000-0000-4000-8000-000000000102';

-- 72: unique web addresses for bulk upload --------------------------------------
create temp table new_ids (n int, id uuid);
insert into new_ids select 1, s.id from public.save_article(null, null,
  pg_temp.article_data('a7000000-0000-4000-8000-000000000012', 'Live one', 'fix-live-one', '', true),
  '[{"full_name":"B. Author"}]') s;
insert into new_ids select 2, s.id from public.save_article(null, null,
  pg_temp.article_data('a7000000-0000-4000-8000-000000000012', 'Live one', 'fix-live-one', '', true),
  '[{"full_name":"C. Author"}]') s;
select is((select a.slug from public.articles a join new_ids n on n.id = a.id where n.n = 1),
  'fix-live-one-2', 'an automatic slug that is taken gets -2');
select is((select a.slug from public.articles a join new_ids n on n.id = a.id where n.n = 2),
  'fix-live-one-3', 'and the next one -3');
update public.articles set deleted_at = now() where slug = 'fix-live-one-3';
select is(public.unique_article_slug('fix-live-one'), 'fix-live-one-4', 'trashed articles keep their address');
select is(public.unique_article_slug('fix-brand-new'), 'fix-brand-new', 'a free slug is returned unchanged');
select is(length(public.unique_article_slug(repeat('a', 80))), 80, 'unique slugs stay within 80 characters');
select throws_ok($$ select * from public.save_article(null, null,
  pg_temp.article_data('a7000000-0000-4000-8000-000000000012', 'Typed', 'fix-live-one', ''),
  '[{"full_name":"D. Author"}]') $$, '23505', null, 'a slug typed by hand is still refused when taken');

-- 78: moving an article to another issue -----------------------------------------
select save_article.version from public.save_article(
  'a7000000-0000-4000-8000-000000000102',
  (select version from public.articles where id = 'a7000000-0000-4000-8000-000000000102'),
  pg_temp.article_data('a7000000-0000-4000-8000-000000000012', 'Draft one', 'fix-draft-one', ''),
  '[{"full_name":"A. Author"}]');
select is((select sort_order from public.articles where id = 'a7000000-0000-4000-8000-000000000102'),
  (select max(sort_order) from public.articles where issue_id = 'a7000000-0000-4000-8000-000000000012'
     and id <> 'a7000000-0000-4000-8000-000000000102') + 10,
  'a moved article goes to the end of its new issue');

-- 74: old issue addresses ---------------------------------------------------------
update public.issues set issue_number = 5 where id = 'a7000000-0000-4000-8000-000000000011';
select is((select issue_id from public.issue_redirects where volume_number = 9917 and issue_number = 1),
  'a7000000-0000-4000-8000-000000000011'::uuid, 'renumbering a published issue keeps its old address');
update public.issues set issue_number = 3 where id = 'a7000000-0000-4000-8000-000000000012';
select is((select count(*)::int from public.issue_redirects where volume_number = 9917 and issue_number = 2),
  0, 'renumbering a draft issue records nothing');
update public.volumes set volume_number = 9918 where id = 'a7000000-0000-4000-8000-000000000001';
select is((select issue_id from public.issue_redirects where volume_number = 9917 and issue_number = 5),
  'a7000000-0000-4000-8000-000000000011'::uuid, 'renumbering the volume keeps the old address too');
update public.issues set issue_number = 1 where id = 'a7000000-0000-4000-8000-000000000011';
select is((select count(*)::int from public.issue_redirects where volume_number = 9918 and issue_number = 1),
  0, 'an address in use again does not redirect');
select throws_ok($$ insert into public.issue_redirects values (1, 1, 'a7000000-0000-4000-8000-000000000011') $$,
  '42501', null, 'editors cannot write redirects directly');
select pg_temp.anon();
select is((select count(*)::int from public.issue_redirects where issue_id = 'a7000000-0000-4000-8000-000000000011'),
  3, 'visitors can read redirects to a published issue');

-- 81: old category addresses -------------------------------------------------------
select pg_temp.login('a7222222-2222-4222-8222-222222222222');
insert into public.categories (id, name, slug) values ('a7000000-0000-4000-8000-000000000201', 'Fix cat', 'fix-cat');
update public.categories set slug = 'fix-cat-renamed' where id = 'a7000000-0000-4000-8000-000000000201';
select pg_temp.anon();
select is((select category_id from public.category_redirects where old_slug = 'fix-cat'),
  'a7000000-0000-4000-8000-000000000201'::uuid, 'a renamed category keeps its old address');

-- 76: audit 'update' entries -----------------------------------------------------------
select pg_temp.reset();
select is((select diff -> 'fields' from public.audit_log
           where entity_type = 'categories' and entity_id = 'a7000000-0000-4000-8000-000000000201'
             and action = 'update' order by id desc limit 1),
  '["slug"]'::jsonb, 'editing a category is audited with the changed field names');

-- 76: page revisions -------------------------------------------------------------------
select pg_temp.login('a7111111-1111-4111-8111-111111111111');
update public.pages set title = 'Privacy (edited)', content = repeat('<p>Long body text.</p>', 20) where slug = 'privacy';
select is((select count(*)::int from public.page_revisions r join public.pages p on p.id = r.page_id where p.slug = 'privacy'),
  2, 'the first save keeps the original and the new version');
update public.pages set content = '<p>Again.</p>' where slug = 'privacy';
select ok((select count(*) = 3 and bool_or(r.content = '<p>Again.</p>')
           from public.page_revisions r join public.pages p on p.id = r.page_id where p.slug = 'privacy'),
  'every later save adds a revision');
update public.pages set needs_review = not needs_review where slug = 'privacy';
select is((select count(*)::int from public.page_revisions r join public.pages p on p.id = r.page_id where p.slug = 'privacy'),
  3, 'saving without changing the text adds no revision');
select ok((select diff -> 'changes' ? 'title' and not (diff -> 'changes' ? 'content') and diff -> 'fields' ? 'content'
           from public.audit_log where entity_type = 'pages' and action = 'update'
             and diff -> 'fields' ? 'title' order by id desc limit 1),
  'page edits list the fields but keep only short values');
select pg_temp.login('a7222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.page_revisions), 0, 'editors cannot read page history');

-- 73: delete a trashed issue for good ----------------------------------------------------
select throws_ok($$ select public.delete_issue_forever('a7000000-0000-4000-8000-000000000012') $$,
  '42501', null, 'editors cannot delete an issue for good');
select pg_temp.login('a7111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.delete_issue_forever('a7000000-0000-4000-8000-000000000012') $$,
  'AW422', null, 'an issue must be in the trash first');
update public.issues set deleted_at = now(), status = 'draft' where id = 'a7000000-0000-4000-8000-000000000012';
select throws_ok($$ select public.delete_issue_forever('a7000000-0000-4000-8000-000000000012') $$,
  'AW422', null, 'an issue with articles outside the trash cannot be deleted');
update public.articles set deleted_at = now() where issue_id = 'a7000000-0000-4000-8000-000000000012';
select lives_ok($$ select public.delete_issue_forever('a7000000-0000-4000-8000-000000000012') $$,
  'a trashed issue whose articles are all trashed can be deleted for good');
select is((select count(*)::int from public.articles where issue_id = 'a7000000-0000-4000-8000-000000000012'),
  0, 'its trashed articles go with it');

select * from finish();
rollback;

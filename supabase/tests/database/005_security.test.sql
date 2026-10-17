-- pgTAP: milestone 9 security hardening. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, aud, role) values
  ('f1111111-1111-4111-8111-111111111111', 'au-sec@t.local', 'authenticated', 'authenticated'),
  ('f2222222-2222-4222-8222-222222222222', 'rev-sec@t.local', 'authenticated', 'authenticated'),
  ('f3333333-3333-4333-8333-333333333333', 'rev2-sec@t.local', 'authenticated', 'authenticated');
update public.profiles set role = 'reviewer' where id in ('f2222222-2222-4222-8222-222222222222', 'f3333333-3333-4333-8333-333333333333');

insert into public.submissions (id, author_id, title, abstract, citation_style, idempotency_key, status)
values ('f4444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', 'Secure Paper', 'A', 'mla8', gen_random_uuid(), 'revisions_requested');
insert into public.submission_files (id, submission_id, path, original_name, mime_type, size_bytes, kind, uploaded_by, version) values
  ('f5555555-5555-4555-8555-555555555555', 'f4444444-4444-4444-8444-444444444444', 'f4444444-4444-4444-8444-444444444444/original/a.docx', 'Okafor_final.docx', 'application/pdf', 10, 'original', 'f1111111-1111-4111-8111-111111111111', 1),
  ('f6666666-6666-4666-8666-666666666666', 'f4444444-4444-4444-8444-444444444444', 'f4444444-4444-4444-8444-444444444444/revision/b.docx', 'Okafor_revised.docx', 'application/pdf', 10, 'revision', 'f1111111-1111-4111-8111-111111111111', 1),
  ('f7777777-7777-4777-8777-777777777777', 'f4444444-4444-4444-8444-444444444444', 'f4444444-4444-4444-8444-444444444444/reviewer_annotated/c.pdf', 'Rita_notes.pdf', 'application/pdf', 10, 'reviewer_annotated', 'f3333333-3333-4333-8333-333333333333', 1);
insert into public.review_assignments (submission_id, reviewer_id) values
  ('f4444444-4444-4444-8444-444444444444', 'f2222222-2222-4222-8222-222222222222'),
  ('f4444444-4444-4444-8444-444444444444', 'f3333333-3333-4333-8333-333333333333');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Reviewer: no file rows (names, paths, uploader), only the neutral list.
select pg_temp.login('f2222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.submission_files), 0, 'reviewers read no submission file rows');
select is((select count(*)::int from public.reviewer_files()), 2, 'reviewer_files lists the manuscript and its revision');
select ok(not exists (select 1 from public.reviewer_files() f where f.kind = 'reviewer_annotated'),
  'another reviewer''s annotated file is not listed');
select ok(not exists (select 1 from public.reviewer_files() f where row_to_json(f)::text ~* 'okafor|rita'),
  'the list carries no names');
select is((select count(*)::int from storage.objects where bucket_id = 'submissions'), 0,
  'reviewers cannot list the submissions bucket');
select throws_ok($$ select public.add_submission_note('f4444444-4444-4444-8444-444444444444', 'x', false) $$, '42501', null,
  'reviewers cannot write timeline notes');

-- The other reviewer sees their own annotated upload, nothing more.
select pg_temp.login('f3333333-3333-4333-8333-333333333333');
select is((select array_agg(original_name) from public.submission_files), array['Rita_notes.pdf'],
  'a reviewer reads only their own annotated upload');

-- Author: notes only through record_revision, once per file.
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.add_submission_note('f4444444-4444-4444-8444-444444444444', 'internal?', false) $$, '42501', null,
  'authors cannot write arbitrary timeline notes');
select is((select recorded from public.record_revision('f6666666-6666-4666-8666-666666666666')), true, 'a revision is recorded');
select is((select recorded from public.record_revision('f6666666-6666-4666-8666-666666666666')), false, 'recording it again adds nothing');
select throws_ok($$ select * from public.record_revision('f5555555-5555-4555-8555-555555555555') $$, '42501', null,
  'only revision files can be recorded as revisions');

-- Schema version: not for the public.
set local role anon;
select throws_ok($$ select public.schema_version() $$, '42501', null, 'anonymous visitors cannot read the schema version');

select * from finish();
rollback;

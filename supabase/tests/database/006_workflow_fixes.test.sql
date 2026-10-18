-- pgTAP: workflow fixes (audit items 44, 48, 51-65). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, email, aud, role) values
  ('c1111111-1111-4111-8111-111111111111', 'ed-wf@t.local', 'authenticated', 'authenticated'),
  ('c2222222-2222-4222-8222-222222222222', 'rev-wf@t.local', 'authenticated', 'authenticated'),
  ('c3333333-3333-4333-8333-333333333333', 'au-wf@t.local', 'authenticated', 'authenticated'),
  ('c4444444-4444-4444-8444-444444444444', 'rev2-wf@t.local', 'authenticated', 'authenticated');
update public.profiles set role = 'editor' where id = 'c1111111-1111-4111-8111-111111111111';
update public.profiles set role = 'reviewer' where id in ('c2222222-2222-4222-8222-222222222222', 'c4444444-4444-4444-8444-444444444444');

-- d1: the main manuscript. d2: never finished. d3: withdrawn by the author.
insert into public.submissions (id, author_id, title, abstract, citation_style, idempotency_key) values
  ('d1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'Workflow Paper', 'A', 'mla8', gen_random_uuid()),
  ('d2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333', 'Unfinished Paper', 'A', 'mla8', gen_random_uuid()),
  ('d3333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 'Withdrawn Paper', 'A', 'mla8', gen_random_uuid());

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.reset() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create or replace function pg_temp.version_of(p uuid) returns int language sql as $$
  select version from public.submissions where id = p
$$;

-- Rate limits (item 44): peeking never counts a hit.
select public.peek_rate_limit('test:peek', 2, 600);
select public.peek_rate_limit('test:peek', 2, 600);
select is((select count(*)::int from public.rate_limits where key = 'test:peek'), 0, 'peek_rate_limit records nothing');
select public.check_rate_limit('test:peek', 2, 600);
select public.check_rate_limit('test:peek', 2, 600);
select is((select allowed from public.peek_rate_limit('test:peek', 2, 600)), false, 'peek reports a full bucket');

-- Finishing a submission (items 48, 51) ---------------------------------------
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select throws_ok($$ select public.finalize_submission('d1111111-1111-4111-8111-111111111111') $$, 'AW422', null,
  'a submission without its Word manuscript cannot be finished');
insert into public.submission_files (submission_id, path, original_name, mime_type, size_bytes, kind, uploaded_by, version) values
  ('d1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111/original/a.docx', 'PAPER.DOCX', 'application/octet-stream', 10, 'original', auth.uid(), 1),
  ('d1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111/original/b.pdf', 'paper.pdf', 'application/pdf', 10, 'original', auth.uid(), 1);
select is((select version from public.submission_files where original_name = 'paper.pdf'), 2,
  'file versions are numbered by the database, whatever the client sends (item 65)');
select is(public.finalize_submission('d1111111-1111-4111-8111-111111111111'), true, 'an upper-case .DOCX finishes the submission');
select is(public.finalize_submission('d1111111-1111-4111-8111-111111111111'), false, 'finishing twice reports nothing new');
select throws_ok($$ update public.submissions set finalised_at = now() where id = 'd2222222-2222-4222-8222-222222222222' $$, '42501', null,
  'authors cannot mark a submission finished directly');
select is((select finalised_at from public.submissions where id = 'd2222222-2222-4222-8222-222222222222'), null,
  'the unfinished submission stays unfinished');

-- Editing details while submitted (item 53).
select lives_ok($$ update public.submissions set title = 'Workflow Paper, Revised Title', keywords = '{a,b,c}'
  where id = 'd1111111-1111-4111-8111-111111111111' $$, 'authors can edit title and keywords while submitted');

-- Status transitions (item 56) --------------------------------------------------
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select throws_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'published', null, true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'AW422', null, 'submitted cannot jump to published');
select throws_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'submitted', null, true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'AW422', null, 'changing to the current status is refused');
select ok(public.submission_transition_allowed('submitted', 'under_review'), 'submitted -> under review is allowed');
select ok(not public.submission_transition_allowed('rejected', 'submitted'), 'rejected -> submitted is not allowed');
select ok(not public.submission_transition_allowed('withdrawn', 'under_review'), 'withdrawn is final');
select ok(not public.submission_transition_allowed('published', 'accepted'), 'published is final');
select ok(public.submission_transition_allowed('rejected', 'under_review'), 'a rejected manuscript can be reopened for review');

-- Notes (item 55): saved, versioned separately, with an id for the email key.
select lives_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'under_review', 'Sent to review.', true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'submitted -> under review');
select isnt(public.add_submission_note('d1111111-1111-4111-8111-111111111111', 'Reviewers are being contacted.', true), null,
  'add_submission_note returns the new event id');
select is((select count(*)::int from public.submission_events where submission_id = 'd1111111-1111-4111-8111-111111111111'
           and message = 'Reviewers are being contacted.' and from_status = to_status), 1, 'the note is on the timeline');
select throws_ok($$ select public.add_submission_note('d1111111-1111-4111-8111-111111111111', '  ', true) $$, 'AW422', null,
  'an empty note is refused');

-- Reviewers (items 58, 60, 61) ---------------------------------------------------
insert into public.review_assignments (submission_id, reviewer_id, assigned_by, due_date) values
  ('d1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', auth.uid(), current_date - 1),
  ('d1111111-1111-4111-8111-111111111111', 'c4444444-4444-4444-8444-444444444444', auth.uid(), current_date - 1);
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select throws_ok($$ update public.review_assignments set status = 'withdrawn' where reviewer_id = auth.uid() $$, '42501', null,
  'a reviewer cannot withdraw without declining');
select throws_ok($$ update public.review_assignments set round = 5 where reviewer_id = auth.uid() $$, '42501', null,
  'a reviewer cannot change the round');
update public.review_assignments set response = 'accepted' where reviewer_id = auth.uid();
select ok((select responded_at is not null from public.review_assignments where reviewer_id = auth.uid()), 'accepting records when');
update public.review_assignments set comments = 'Good.', confidential_comments = 'For the editors only.',
  recommendation = 'minor_revisions', status = 'submitted' where reviewer_id = auth.uid();
select is((select confidential_comments from public.reviewer_queue()), 'For the editors only.', 'reviewers read back their own confidential comments');

select pg_temp.login('c4444444-4444-4444-8444-444444444444');
update public.review_assignments set response = 'declined', status = 'withdrawn', decline_reason = 'On leave.' where reviewer_id = auth.uid();
select is((select count(*)::int from public.reviewer_queue()), 0, 'a declined invitation leaves the queue');
select pg_temp.reset();
select is((select response || ':' || status::text || ':' || decline_reason from public.review_assignments
           where reviewer_id = 'c4444444-4444-4444-8444-444444444444'), 'declined:withdrawn:On leave.', 'the editors see the decline and reason');

-- Reminder bookkeeping doesn't bump the version (item 61).
create temp table before_reminder as
  select version from public.review_assignments where reviewer_id = 'c2222222-2222-4222-8222-222222222222';
update public.review_assignments set reminder_sent_at = now() where reviewer_id = 'c2222222-2222-4222-8222-222222222222';
select is((select version from public.review_assignments where reviewer_id = 'c2222222-2222-4222-8222-222222222222'),
  (select version from before_reminder), 'reminder_sent_at does not change the version');
-- Nor does accepting the invitation: the reviewer then writes the review on
-- the same page, with the version it loaded.
update public.review_assignments set response = null, responded_at = null
  where reviewer_id = 'c2222222-2222-4222-8222-222222222222';
update before_reminder set version = (select version from public.review_assignments
  where reviewer_id = 'c2222222-2222-4222-8222-222222222222');
update public.review_assignments set response = 'accepted' where reviewer_id = 'c2222222-2222-4222-8222-222222222222';
select is((select version from public.review_assignments where reviewer_id = 'c2222222-2222-4222-8222-222222222222'),
  (select version from before_reminder), 'accepting an invitation does not change the version');

-- Authors never read reviews, so never confidential comments (item 60).
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is((select count(*)::int from public.review_assignments), 0, 'authors read no review rows');
select is((select count(*)::int from public.reviewer_queue()), 0, 'authors get an empty reviewer queue');

-- Revisions (items 52, 54, 58) ----------------------------------------------------
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select lives_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'revisions_requested', 'Please revise.', true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'under review -> revisions requested');
select is((select revision_due_date from public.submissions where id = 'd1111111-1111-4111-8111-111111111111'),
  (now() at time zone 'utc')::date + 28, 'the revision is due in four weeks by default');
select pg_temp.reset();
update public.submissions set revision_due_date = current_date - 2 where id = 'd1111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.due_revision_reminders() where submission_id = 'd1111111-1111-4111-8111-111111111111'), 1,
  'an overdue revision is due a reminder');
update public.submissions set revision_reminder_sent_at = now() where id = 'd1111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.due_revision_reminders() where submission_id = 'd1111111-1111-4111-8111-111111111111'), 0,
  'at most one reminder a week');

select pg_temp.login('c3333333-3333-4333-8333-333333333333');
insert into public.submission_files (id, submission_id, path, original_name, mime_type, size_bytes, kind, uploaded_by) values
  ('e1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111/revision/c.docx',
   'paper-v2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 10, 'revision', auth.uid());
select is((select recorded from public.record_revision('e1111111-1111-4111-8111-111111111111', 'I rewrote section 2.')), true,
  'the revision is recorded with a response');
select is((select status::text from public.submissions where id = 'd1111111-1111-4111-8111-111111111111'), 'revision_received',
  'the submission is now "revision received"');
select is((select author_response from public.submission_files where id = 'e1111111-1111-4111-8111-111111111111'), 'I rewrote section 2.',
  'the response to the reviewers is stored with the file');
select is((select recorded from public.record_revision('e1111111-1111-4111-8111-111111111111', 'again')), false, 'recording twice adds nothing');

select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select lives_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'under_review', null, true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'the revision goes back to review');
select is((select review_round from public.submissions where id = 'd1111111-1111-4111-8111-111111111111'), 2, 'a second review round starts');
select lives_ok($$ insert into public.review_assignments (submission_id, reviewer_id, assigned_by)
  values ('d1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', auth.uid()) $$,
  'the same reviewer can be invited again for round 2');
select is((select array_agg(round order by round) from public.review_assignments
           where reviewer_id = 'c2222222-2222-4222-8222-222222222222'), array[1, 2], 'both rounds are kept');

-- A decision closes outstanding reviews (item 59).
select lives_ok(format($$ select public.change_submission_status('d1111111-1111-4111-8111-111111111111', %s, 'accepted', null, true) $$,
  pg_temp.version_of('d1111111-1111-4111-8111-111111111111')), 'under review -> accepted');
select is((select status::text from public.review_assignments where reviewer_id = 'c2222222-2222-4222-8222-222222222222' and round = 2),
  'withdrawn', 'the pending round-2 review is closed by the decision');
select is((select status::text from public.review_assignments where reviewer_id = 'c2222222-2222-4222-8222-222222222222' and round = 1),
  'submitted', 'submitted reviews stay as they were');

-- Publication (item 57): the article is published, then its issue.
select pg_temp.reset();
insert into public.volumes (id, volume_number, year) values ('d9999999-9999-4999-8999-999999999999', 9001, 2026);
insert into public.issues (id, volume_id, issue_number, status) values ('da999999-9999-4999-8999-999999999999', 'd9999999-9999-4999-8999-999999999999', 1, 'draft');
insert into public.articles (id, issue_id, title, slug, status, submission_id)
values ('db999999-9999-4999-8999-999999999999', 'da999999-9999-4999-8999-999999999999', 'Workflow Paper', 'workflow-paper-test', 'draft',
        'd1111111-1111-4111-8111-111111111111');
update public.submissions set article_id = 'db999999-9999-4999-8999-999999999999' where id = 'd1111111-1111-4111-8111-111111111111';
update public.articles set status = 'published' where id = 'db999999-9999-4999-8999-999999999999';
select is((select status::text from public.submissions where id = 'd1111111-1111-4111-8111-111111111111'), 'accepted',
  'publishing the article in a draft issue changes nothing yet');
update public.issues set status = 'published' where id = 'da999999-9999-4999-8999-999999999999';
select is((select status::text from public.submissions where id = 'd1111111-1111-4111-8111-111111111111'), 'published',
  'publishing the issue publishes the submission');
select is((select count(*)::int from public.domain_events where event_type = 'submission.published'
           and aggregate_id = 'd1111111-1111-4111-8111-111111111111'), 1, 'one submission.published event for the email');

-- Withdrawal (item 53) -------------------------------------------------------------
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select throws_ok($$ update public.submissions set status = 'withdrawn' where id = 'd3333333-3333-4333-8333-333333333333' $$, '42501', null,
  'authors cannot set the status directly');
select lives_ok($$ select public.withdraw_submission('d3333333-3333-4333-8333-333333333333', 'Submitted elsewhere.') $$,
  'authors can withdraw their submission');
select is((select message from public.submission_events where submission_id = 'd3333333-3333-4333-8333-333333333333' and to_status::text = 'withdrawn'),
  E'Withdrawn by the author.\n\nReason: Submitted elsewhere.', 'the reason is on the timeline');
select throws_ok($$ select public.withdraw_submission('d1111111-1111-4111-8111-111111111111', null) $$, 'AW422', null,
  'a published manuscript cannot be withdrawn online');
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select throws_ok(format($$ select public.change_submission_status('d3333333-3333-4333-8333-333333333333', %s, 'under_review', 'Back?', true) $$,
  pg_temp.version_of('d3333333-3333-4333-8333-333333333333')), 'AW422', null, 'editors cannot move a withdrawn submission');

select * from finish();
rollback;

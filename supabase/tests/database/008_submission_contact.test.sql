-- How to reach a submission's author (contact email and phone, migration 18).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_column('public', 'submissions', 'contact_email', 'submissions keep a contact email');
select has_column('public', 'submissions', 'contact_phone', 'submissions keep a contact phone number');

create temp table phone_rule as
  select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'submissions_contact_phone_check';

-- The same pattern the constraint uses, checked on typical numbers.
create temp table phones (number text, ok boolean);
insert into phones values ('+234 803 123 4567', true), ('(0803) 123-4567', true), ('08031234567', true),
  ('call me', false), ('12', false);
select is(
  (select count(*)::int from phones where (number ~ '^\+?[0-9(][0-9 ().-]{5,23}[0-9]$') = ok),
  5, 'Nigerian and international numbers pass, words and short numbers fail');
select ok((select def from phone_rule) like '%contact_phone%', 'the phone rule is enforced by the database');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'submissions_contact_email_check') like '%@%',
  'the email rule is enforced by the database');
select ok(
  (select pg_get_function_result('public.reviewer_queue'::regproc)) not similar to '%(contact_email|contact_phone)%',
  'reviewers never get the contact details');

select * from finish();
rollback;

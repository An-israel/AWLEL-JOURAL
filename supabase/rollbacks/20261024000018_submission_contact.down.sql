-- Reverses 20261024000018_submission_contact.sql.
alter table public.submissions drop constraint if exists submissions_contact_phone_check;
alter table public.submissions drop constraint if exists submissions_contact_email_check;
alter table public.submissions
  drop column if exists contact_phone,
  drop column if exists contact_email;

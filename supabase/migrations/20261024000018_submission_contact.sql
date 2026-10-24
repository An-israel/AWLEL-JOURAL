-- =============================================================================
-- How to reach the author of a submission: the email address and phone number
-- given on the submission form. Visible to the author and the editors only
-- (the existing submissions policies); reviewers never see them, since they
-- read submissions through reviewer_queue(), which doesn't return them.
-- Empty on submissions made before this update.
-- Reversal: supabase/rollbacks/20261024000018_submission_contact.down.sql
-- =============================================================================
alter table public.submissions
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

alter table public.submissions drop constraint if exists submissions_contact_email_check;
alter table public.submissions add constraint submissions_contact_email_check
  check (contact_email is null or (char_length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- Digits with optional +, spaces, dashes, dots and brackets: +234 803 123 4567, (0803) 123-4567.
alter table public.submissions drop constraint if exists submissions_contact_phone_check;
alter table public.submissions add constraint submissions_contact_phone_check
  check (contact_phone is null or contact_phone ~ '^\+?[0-9(][0-9 ().-]{5,23}[0-9]$');

-- Reverses 20261017000008_review_workflow.sql.
drop function if exists public.reviewer_queue();
drop function if exists public.add_submission_note(uuid, text, boolean);
drop function if exists public.change_submission_status(uuid, int, public.submission_status, text, boolean);

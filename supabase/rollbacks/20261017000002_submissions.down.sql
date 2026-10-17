-- Reverses 20261017000002_submissions.sql. Destroys all submissions and reviews.
drop function if exists public.is_assigned_reviewer(uuid);
drop function if exists public.is_submission_author(uuid);
drop table if exists public.review_assignments;
drop table if exists public.submission_events;
drop table if exists public.submission_files;
drop table if exists public.submission_authors;
alter table if exists public.articles drop column if exists submission_id;
drop table if exists public.submissions;
drop function if exists public.guard_review_changes();
drop function if exists public.guard_submission_changes();
drop function if exists public.log_submission_status();
drop type if exists public.review_recommendation;
drop type if exists public.review_status;
drop type if exists public.submission_file_kind;
drop type if exists public.submission_status;

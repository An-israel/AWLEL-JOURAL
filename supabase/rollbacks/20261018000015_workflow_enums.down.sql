-- Reverses 20261018000015_workflow_enums.sql (run after the 000016 reversal).
-- Postgres can't drop a value from an enum, and rebuilding the type would mean
-- dropping and recreating every policy and function that uses the status
-- column. So the data is moved off the two values instead, and the unused
-- labels stay in the type: harmless, and re-running the migration is a no-op
-- thanks to "if not exists".
--   revision_received -> revisions_requested (how a received revision was shown before)
--   withdrawn         -> rejected (the closest earlier final state)
update public.submissions set status = 'revisions_requested' where status::text = 'revision_received';
update public.submissions set status = 'rejected' where status::text = 'withdrawn';
update public.submission_events set from_status = 'revisions_requested' where from_status::text = 'revision_received';
update public.submission_events set to_status = 'revisions_requested' where to_status::text = 'revision_received';
update public.submission_events set from_status = 'rejected' where from_status::text = 'withdrawn';
update public.submission_events set to_status = 'rejected' where to_status::text = 'withdrawn';

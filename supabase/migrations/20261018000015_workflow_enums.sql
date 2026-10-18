-- =============================================================================
-- Workflow fixes, part 1: new submission statuses (audit items 52, 53).
--   revision_received  the author has sent a revised manuscript; it is with
--                      the editors (shown instead of "Revisions requested")
--   withdrawn          the author (or the editors) withdrew the manuscript;
--                      terminal
-- Postgres can't use a new enum value in the transaction that adds it, and
-- the CLI runs each migration file in one transaction, so the values are
-- added here and used from 20261018000016_workflow_fixes.sql onwards.
-- Reversal: supabase/rollbacks/20261018000015_workflow_enums.down.sql
-- =============================================================================

alter type public.submission_status add value if not exists 'revision_received' after 'revisions_requested';
alter type public.submission_status add value if not exists 'withdrawn' after 'published';

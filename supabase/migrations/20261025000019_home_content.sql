-- =============================================================================
-- The home page's wording, edited in Admin → Home page (lib/home-content.ts).
-- Empty until someone saves: the site then shows the original wording. The
-- existing site_settings policies apply (everyone reads, Super Admins write)
-- and the audit trigger records each change.
-- Reversal: supabase/rollbacks/20261025000019_home_content.down.sql
-- =============================================================================
alter table public.site_settings
  add column if not exists home_content jsonb not null default '{}'::jsonb;

alter table public.site_settings drop constraint if exists site_settings_home_content_check;
alter table public.site_settings add constraint site_settings_home_content_check
  check (jsonb_typeof(home_content) = 'object' and pg_column_size(home_content) < 65536);

-- Reverses 20261025000019_home_content.sql (the edited home page wording is lost).
alter table public.site_settings drop constraint if exists site_settings_home_content_check;
alter table public.site_settings drop column if exists home_content;

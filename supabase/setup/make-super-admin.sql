-- =============================================================================
-- AWLEL: make yourself the first Super Admin.
--
-- 1. On the website, open /signup and create your account with your email.
-- 2. Confirm it from the email Supabase sends you.
-- 3. Supabase dashboard → SQL Editor → New query → paste this → replace the
--    email address below with yours → Run.
-- It should say "1 row" (or "Success"). Then sign in on the website: you are
-- taken to the admin dashboard. Every other staff account is invited from
-- Admin → Users and Roles.
-- =============================================================================
update public.profiles
set role = 'super_admin', is_active = true
where email = lower('YOUR-EMAIL@example.com');

select email, role from public.profiles where role = 'super_admin';

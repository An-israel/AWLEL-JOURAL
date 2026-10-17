-- =============================================================================
-- Row Level Security for every table (section 6). The UI hides buttons; this
-- file is what actually enforces the permissions table.
--
-- Conventions:
--   * `(select fn())` wrappers let Postgres evaluate role checks once per
--     statement instead of once per row.
--   * Server code that must bypass RLS (contact form insert, metrics, queue)
--     uses the service role key, which is only ever loaded server-side.
-- Reversal: supabase/rollbacks/20261017000004_rls.down.sql
-- =============================================================================

create or replace function public.feature_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = p_key), false)
$$;

-- Published = row published, not soft-deleted, and its issue published too.
create or replace function public.is_published_article(p_article_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.articles a
    join public.issues i on i.id = a.issue_id
    where a.id = p_article_id
      and a.status = 'published' and a.deleted_at is null
      and i.status = 'published' and i.deleted_at is null)
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'stored_files', 'volumes', 'issues', 'categories', 'articles',
    'article_authors', 'slug_redirects', 'editorial_board_groups',
    'editorial_board_members', 'pages', 'department_milestones', 'site_settings',
    'contact_messages', 'metrics_events', 'metrics_daily', 'audit_log',
    'submissions', 'submission_authors', 'submission_files', 'submission_events',
    'review_assignments', 'domain_events', 'jobs', 'dead_letter_jobs',
    'feature_flags', 'rate_limits'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: staff read all" on public.profiles for select to authenticated
  using ((select public.is_staff()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: super admin update" on public.profiles for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "profiles: super admin delete" on public.profiles for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- stored_files (metadata of published files and covers)
-- ---------------------------------------------------------------------------
create policy "stored_files: public metadata of published files" on public.stored_files for select
  using (
    bucket in ('issue-covers', 'site-assets')
    or exists (select 1 from public.articles a
               where (a.pdf_file_id = stored_files.id or a.docx_file_id = stored_files.id)
                 and public.is_published_article(a.id))
    or exists (select 1 from public.issues i
               where (i.full_pdf_file_id = stored_files.id or i.full_docx_file_id = stored_files.id)
                 and i.status = 'published' and i.deleted_at is null));
create policy "stored_files: staff read" on public.stored_files for select to authenticated
  using ((select public.is_staff()));
create policy "stored_files: staff insert" on public.stored_files for insert to authenticated
  with check ((select public.is_staff()) and uploaded_by = (select auth.uid()));
create policy "stored_files: super admin delete" on public.stored_files for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- volumes / issues
-- ---------------------------------------------------------------------------
create policy "volumes: public read with a published issue" on public.volumes for select
  using (exists (select 1 from public.issues i
                 where i.volume_id = volumes.id and i.status = 'published' and i.deleted_at is null));
create policy "volumes: staff read" on public.volumes for select to authenticated
  using ((select public.is_staff()));
create policy "volumes: staff write" on public.volumes for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "issues: public read published" on public.issues for select
  using (status = 'published' and deleted_at is null);
create policy "issues: staff read" on public.issues for select to authenticated
  using ((select public.is_staff()));
create policy "issues: staff insert" on public.issues for insert to authenticated
  with check ((select public.is_staff()));
create policy "issues: staff update" on public.issues for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "issues: super admin hard delete" on public.issues for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create policy "categories: public read" on public.categories for select using (true);
create policy "categories: staff write" on public.categories for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- articles / authors / redirects
-- ---------------------------------------------------------------------------
create policy "articles: public read published" on public.articles for select
  using (status = 'published' and deleted_at is null
         and exists (select 1 from public.issues i
                     where i.id = articles.issue_id and i.status = 'published' and i.deleted_at is null));
create policy "articles: staff read" on public.articles for select to authenticated
  using ((select public.is_staff()));
create policy "articles: staff insert" on public.articles for insert to authenticated
  with check ((select public.is_staff()));
create policy "articles: staff update" on public.articles for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "articles: super admin hard delete" on public.articles for delete to authenticated
  using ((select public.is_super_admin()));

-- Author emails are private unless show_email is set, so the base table is
-- staff-only and the public reads `public_article_authors` (defined below).
create policy "article_authors: staff all" on public.article_authors for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create view public.public_article_authors
with (security_barrier = true)
as
  select aa.id, aa.article_id, aa.full_name, aa.affiliation, aa.orcid, aa.position,
         aa.is_corresponding,
         case when aa.show_email then aa.email end as email
  from public.article_authors aa
  where public.is_published_article(aa.article_id);
revoke all on public.public_article_authors from public, anon, authenticated;
grant select on public.public_article_authors to anon, authenticated;

create policy "slug_redirects: public read for published" on public.slug_redirects for select
  using (public.is_published_article(article_id));
create policy "slug_redirects: staff all" on public.slug_redirects for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- editorial board, pages, department timeline, settings (Super Admin)
-- ---------------------------------------------------------------------------
create policy "board groups: public read" on public.editorial_board_groups for select using (true);
create policy "board groups: super admin write" on public.editorial_board_groups for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "board members: public read" on public.editorial_board_members for select
  using (deleted_at is null);
create policy "board members: super admin read" on public.editorial_board_members for select to authenticated
  using ((select public.is_super_admin()));
create policy "board members: super admin write" on public.editorial_board_members for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "pages: public read" on public.pages for select using (true);
create policy "pages: super admin write" on public.pages for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "milestones: public read" on public.department_milestones for select using (true);
create policy "milestones: super admin write" on public.department_milestones for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "site_settings: public read" on public.site_settings for select using (true);
create policy "site_settings: super admin update" on public.site_settings for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "feature_flags: public read" on public.feature_flags for select using (true);
create policy "feature_flags: super admin update" on public.feature_flags for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- contact messages (inserted server-side after spam checks)
-- ---------------------------------------------------------------------------
create policy "contact: staff read" on public.contact_messages for select to authenticated
  using ((select public.is_staff()));
create policy "contact: staff mark read / soft delete" on public.contact_messages for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "contact: super admin delete" on public.contact_messages for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- metrics + audit (written server-side / by triggers only)
-- ---------------------------------------------------------------------------
create policy "metrics_events: staff read" on public.metrics_events for select to authenticated
  using ((select public.is_staff()));
create policy "metrics_daily: staff read" on public.metrics_daily for select to authenticated
  using ((select public.is_staff()));
create policy "audit_log: super admin read" on public.audit_log for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
create policy "submissions: author read own" on public.submissions for select to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null);
create policy "submissions: staff read" on public.submissions for select to authenticated
  using ((select public.is_staff()));
create policy "submissions: author create" on public.submissions for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'submitted'
    and article_id is null
    and (select public.current_user_role()) in ('author', 'editor', 'super_admin')
    and (select public.feature_enabled('submissions_open')));
create policy "submissions: author edit own while open" on public.submissions for update to authenticated
  using (author_id = (select auth.uid()) and status in ('submitted', 'revisions_requested') and deleted_at is null)
  with check (author_id = (select auth.uid()));
create policy "submissions: staff update" on public.submissions for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "submissions: super admin delete" on public.submissions for delete to authenticated
  using ((select public.is_super_admin()));
-- Reviewers get no direct access to `submissions` or `submission_authors`:
-- they read a blinded projection through a SECURITY DEFINER function
-- (milestone 6), so author identity can never reach them.

create policy "submission_authors: author read own" on public.submission_authors for select to authenticated
  using (public.is_submission_author(submission_id));
create policy "submission_authors: author write while open" on public.submission_authors for all to authenticated
  using (exists (select 1 from public.submissions s
                 where s.id = submission_id and s.author_id = (select auth.uid())
                   and s.status in ('submitted', 'revisions_requested')))
  with check (exists (select 1 from public.submissions s
                      where s.id = submission_id and s.author_id = (select auth.uid())
                        and s.status in ('submitted', 'revisions_requested')));
create policy "submission_authors: staff all" on public.submission_authors for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "submission_files: author read own manuscripts" on public.submission_files for select to authenticated
  using (kind in ('original', 'revision') and public.is_submission_author(submission_id));
create policy "submission_files: reviewer read assigned" on public.submission_files for select to authenticated
  using (public.is_assigned_reviewer(submission_id)
         and (kind in ('original', 'revision') or uploaded_by = (select auth.uid())));
create policy "submission_files: staff read" on public.submission_files for select to authenticated
  using ((select public.is_staff()));
create policy "submission_files: author upload" on public.submission_files for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from public.submissions s
                where s.id = submission_id and s.author_id = (select auth.uid())
                  and ((kind = 'original' and s.status = 'submitted')
                       or (kind = 'revision' and s.status = 'revisions_requested'))));
create policy "submission_files: reviewer annotated upload" on public.submission_files for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and kind = 'reviewer_annotated'
              and public.is_assigned_reviewer(submission_id));
create policy "submission_files: staff insert" on public.submission_files for insert to authenticated
  with check ((select public.is_staff()) and uploaded_by = (select auth.uid()));

create policy "submission_events: author read visible" on public.submission_events for select to authenticated
  using (visible_to_author and public.is_submission_author(submission_id));
create policy "submission_events: staff read" on public.submission_events for select to authenticated
  using ((select public.is_staff()));

create policy "reviews: reviewer read own" on public.review_assignments for select to authenticated
  using (reviewer_id = (select auth.uid()));
create policy "reviews: reviewer update own" on public.review_assignments for update to authenticated
  using (reviewer_id = (select auth.uid()) and status = 'pending')
  with check (reviewer_id = (select auth.uid()));
create policy "reviews: staff all" on public.review_assignments for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- operations (queue is worked by the service role; Super Admin can inspect)
-- ---------------------------------------------------------------------------
create policy "domain_events: super admin read" on public.domain_events for select to authenticated
  using ((select public.is_super_admin()));
create policy "jobs: super admin read" on public.jobs for select to authenticated
  using ((select public.is_super_admin()));
create policy "dead letters: super admin read" on public.dead_letter_jobs for select to authenticated
  using ((select public.is_super_admin()));
create policy "dead letters: super admin resolve" on public.dead_letter_jobs for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
-- rate_limits: no policies; only the service role (which bypasses RLS) uses it.

-- Helper functions callable by clients.
revoke execute on function public.is_published_article(uuid) from public;
grant execute on function public.is_published_article(uuid) to anon, authenticated, service_role;

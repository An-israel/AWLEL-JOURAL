# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/) and the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are tagged `vMAJOR.MINOR.PATCH`.

## [Unreleased]

### Added — Milestone 7: Downloads, analytics and SEO

- Download routes `/api/download/article/[id]` and `/api/download/issue/[id]` (`?format=pdf|docx`): check
  the item is published, record the download, then redirect to a one-minute signed link with a clean file
  name such as `AWLEL_Vol25_Issue1_Okeke_2025.pdf` or `AWLEL_Vol25_Issue1_Full_Issue.pdf`. Rate limited;
  a missing format returns 404 (and its button is hidden).
- Analytics: article views (recorded by the page once it loads) and downloads by format, counted once per
  visitor per day with no cookies and no personal data; bots left out. Article pages show live counts.
- Admin dashboard: views and downloads chart (7 days, 30 days, 90 days or 12 months) with hover and
  keyboard read-out and a table view, top 10 articles, submissions by status. Article list shows views
  and downloads.
- Google Scholar `citation_*` tags and Dublin Core tags on article pages; JSON-LD `ScholarlyArticle`,
  `PublicationIssue`/`PublicationVolume` and `Periodical`; Twitter cards; generated brand-style sharing
  images for articles, issues and the site (or the default image uploaded in Settings).
- `sitemap.xml` with every published issue, article and category; RSS feed at `/feed.xml`; `robots.txt`
  lets crawlers reach article PDFs.
- Database: `record_metric_event`, `rollup_metrics` (daily rollup, 13-month raw retention),
  `metrics_timeseries` and `metrics_top_articles` (migration 9, with rollback) and pgTAP tests.
- Tests: unit tests for Scholar tags, JSON-LD, bot detection and file names; an end-to-end test from
  publishing through reading, downloading, the tags, the sitemap, the feed and the dashboard.

### Added — Milestone 6: Submissions and peer review

- Submit a manuscript (signed-in authors): title, abstract, keywords, subject area, citation style,
  co-authors, cover letter, .docx manuscript (plus optional PDF), and the three declarations. Validated on
  both sides, rate limited per account, and safe to double-click or retry (idempotency key). Files go
  straight to private storage via signed URLs.
- My submissions: each manuscript's status with a plain-language explanation, a timeline of messages from
  the editors, files, and revised-manuscript upload when revisions are requested.
- Admin Submissions: filterable list; detail page with authors, files, reviews received and full history;
  change status with an optional message to the author (one transaction, version-checked); internal notes;
  assign reviewers with a due date, withdraw them; create a draft article (with authors) from an accepted
  manuscript.
- Reviews: reviewers get a queue and a blinded manuscript page (no author names, emails, institutions or
  cover letter, enforced in the database) with a neutral download name; recommendation, rich-text
  comments, optional annotated file, save draft, submit.
- Emails (queued, retried, idempotent): submission received (author and editors), status changed,
  reviewer invited, review submitted, revision uploaded.
- Database: `change_submission_status`, `add_submission_note`, `reviewer_queue` (migration 8, with
  rollback) and pgTAP tests for the workflow.
- End-to-end test of one manuscript through submit, screening, review, decision and article creation.

### Fixed

- Vercel builds no longer fail before the database schema has been applied, and accept the environment
  variable names the Supabase–Vercel integration sets.

### Added — Milestone 5: Admin content management

- Volumes and Issues: grouped by year; create volumes (number and year entered separately) and issues;
  edit issue details and editorial (rich text); cover and full-issue PDF/Word uploads; publish (optionally
  with its draft articles) or unpublish; trash and restore; preview drafts; reorder articles.
- Articles: searchable, filterable, paginated list (issue, category, status, trash); editor with slug from
  title, abstract editor, keywords, pages, DOI, citation style, sortable authors (private emails unless
  marked), PDF/Word uploads; publish, unpublish, trash, restore, preview. Article and authors save in one
  transaction.
- Bulk upload: CSV import of article metadata, drag-and-drop of many files with automatic matching
  (CSV file names, author surname, first page), manual correction, then drafts created and files uploaded
  three at a time with a visible queue. Existing articles in the issue can receive files too.
- Uploads go straight from the browser to Supabase Storage via signed URLs, are verified and recorded,
  and are compensated (removed) if the database step fails. Every replaced file is kept; any earlier
  version can be opened or restored.
- Categories: create, edit, archive/restore and reorder, with article counts.
- Pages (Super Admin): Tiptap rich-text editor with live preview and a placeholder highlighter, search
  description, "still contains placeholders" flag, and the Department timeline editor.
- Editorial Board (Super Admin): groups (add, rename, reorder) and members (add, edit, reorder, photo,
  "to be verified" flag, remove and restore).
- Messages: contact-form inbox with unread state, search, trash and restore, and reply by email.
- Settings (Super Admin): journal details, social links, logo (shown in the site header), default sharing
  image, feature switches and the database schema version.
- Optimistic locking everywhere an editor saves, with a clear "someone else edited this" message;
  unsaved-changes warnings; public pages refreshed immediately after every change.
- End-to-end tests: editor creates, uploads and publishes an article; bulk upload; stale edits refused;
  categories; editors blocked from Super Admin sections; page editing; feature switches.

### Added — Milestone 4: Auth and roles

- Sign in, author self-registration, forgot / reset password, sign out, and the `/auth/callback` route that
  completes confirmation, invitation, password-reset and Google sign-in links. "Sign in with Google" is
  behind the `google_sign_in` feature flag.
- Login, sign-up and password-reset requests are rate limited per IP and per account; error messages
  don't reveal whether an account exists; `?next=` only accepts same-site paths.
- Data access layer (`lib/auth.ts`) used by every protected page and server action; role-gated admin area
  (`/admin`) with a navy sidebar filtered by role, breadcrumbs, toasts and confirmation dialogs
  (shadcn/ui-style components on Radix, restyled to AWLEL).
- Users and Roles (Super Admin): search and filter, invite by email with a role, change role, deactivate
  and reactivate (also blocks the account in Supabase Auth). The last active Super Admin can't be demoted
  or deactivated; role changes are audit-logged with the acting admin.
- Admin dashboard with headline counts and recent activity; "My profile" (name, affiliation, ORCID,
  password); author account page at `/account`; 403 page.
- End-to-end tests: registration, wrong password, role-based redirects, Super Admin changes a role, last
  Super Admin protection, deactivation, invitations, editors blocked from Users and Roles.

### Added — Milestone 3: Static pages

- Scope (with live links to every subject area), Submission Guidelines (house structure, citation rules,
  marked placeholders, closing submit call to action), About the Journal, Privacy. All content comes from
  the editable `pages` table, is sanitised on render and gets an automatic "On this page" list.
- Editorial Board directory grouped by role, with photos or monogram portraits.
- The Department: long-form page, milestones timeline, link to the university; placeholders clearly marked.
- Contact Us: form saved to `contact_messages`, emailed to the editorial office through the job queue
  (Resend; logged locally without a key); honeypot, minimum fill time and per-IP rate limiting.
- Email sender with timeout and idempotency key, job enqueue/claim with exponential backoff and
  jitter, dead-lettering after the last attempt.

### Added — Milestone 2: Public site

- Home page: hero with the latest issue cover, latest issue contents, browse by category with article
  counts, most read / most downloaded, About summary, recent covers and an authors' call to action.
- Journal Archive grouped by year with a year filter and jump-to-year links.
- Issue pages (`/issues/[volume]/[issue]`): cover, label, editorial, full-issue downloads, table of
  contents with category tags, page ranges and abstract toggles, previous/next issue.
- Article pages (`/articles/[slug]`): authors with affiliations and ORCID, keywords, DOI, abstract,
  downloads with counts, collapsible PDF preview, "Cite this article" (APA 7th, MLA 8th, BibTeX with
  rich-text copy, downloadable .ris), share links, more from this issue / category. Renamed slugs
  redirect permanently.
- Category pages with newest / most-read sorting.
- Search (`/search`) over titles, abstracts, keywords and author names with highlighted matches,
  filters for year, issue, category and author, and pagination (Postgres full-text search).
- Typographic house-style cover used whenever an issue has no uploaded cover image.
- Citation formatter and issue labelling with unit tests; end-to-end tests for archive → issue →
  article, citations, categories, search and 404s.

### Added — Milestone 1: Foundation

- Next.js 16 project (App Router, Cache Components, strict TypeScript), Tailwind CSS 4 with the AWLEL
  design tokens, Poppins and Source Serif 4.
- Site shell: header with search, sign-in and "Submit a Manuscript"; eight-tab navigation (flat at
  1280px and wider, slide-out menu below); footer; skip link; custom 404 page; `robots.txt`.
- Supabase schema migrations: profiles and roles, volumes, issues, articles and authors, categories,
  slug redirects, editorial board, pages, department timeline, site settings, contact messages,
  metrics, audit log, submissions and reviews, domain events, job queue, dead letters, feature flags,
  rate limits. Paired rollback scripts for every migration.
- Row Level Security on every table and policies on every storage bucket; database tests (pgTAP)
  covering role permissions, reviewer blinding and the last-Super-Admin rule.
- Seed data: categories, editorial board (to be verified), placeholder pages, sample issue.
- First Super Admin script (`npm run seed:admin`).
- API gateway wrapper (request ids, origin check, rate limiting, zod validation, error shaping),
  structured logging, OpenTelemetry/Sentry instrumentation, security headers and CSP.
- Health, liveness and readiness endpoints.
- GitHub Actions CI (lint, format, types, unit, database, end-to-end, Docker), production migration
  workflow, Dependabot.
- Dockerfile and docker-compose for local development and self-hosting.

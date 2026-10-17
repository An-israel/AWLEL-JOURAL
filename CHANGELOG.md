# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/) and the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are tagged `vMAJOR.MINOR.PATCH`.

## [Unreleased]

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

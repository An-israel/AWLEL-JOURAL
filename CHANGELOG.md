# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/) and the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are tagged `vMAJOR.MINOR.PATCH`.

## [Unreleased]

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

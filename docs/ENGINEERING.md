# Engineering decisions

How each of the 111 production concerns in the brief (section 16) is handled. **Status** is one of:

- **BUILD**: implemented in this repository.
- **PLATFORM**: provided by Vercel or Supabase; configured and documented here.
- **NOT NEEDED**: does not apply at this size; the note says why and what would change that.

**State** shows progress: ✅ done, 🟡 partly done, ⏳ planned for the milestone shown. Items still 🟡 are
finished in milestone 9 (polish, security review, production measurements).

Architecture in one paragraph: a single stateless Next.js app on Vercel (static pages served from the CDN,
serverless functions for everything dynamic) talking to one Supabase project (Postgres with Row Level
Security, Auth, Storage, Realtime) in one region. All shared state lives in Postgres. Background work goes
through a Postgres job queue drained by cron (Vercel Cron daily, GitHub Actions every 30 minutes); backups go
to the journal's Google Drive. There are no other services.

## Traffic, caching and delivery

| #   | Item              | Status     | Where                                                         | State | Notes |
| --- | ----------------- | ---------- | ------------------------------------------------------------- | ----- | ----- |
| 1   | Rate limiting     | BUILD      | `lib/server/rate-limit.ts`, `check_rate_limit()` in migration 3 | ✅ M9 | Postgres fixed-window limiter (no extra vendor). Returns 429 + `Retry-After`. Applied to login, sign-up and password reset (per IP and per account), contact form, manuscript submission (per account), downloads (120/min per IP), the view counter, the public API and `/api/health`. Keys are HMAC-hashed; never raw IPs. Fails open if the DB is down. Client IPs come from `x-real-ip`/`x-forwarded-for`, which Vercel sets; when self-hosting, put the app behind a proxy that overwrites them, or the IP limits can be bypassed (`docs/SELF_HOSTING.md`). |
| 2   | Caching           | BUILD      | `next.config.ts` (`cacheComponents`), `lib/data/*`             | ✅ M9 | Public pages are static shells with `"use cache"` data tagged by entity (`lib/data/tags.ts`), served from the CDN. Public API responses `s-maxage=300, stale-while-revalidate=86400`; RSS `s-maxage=3600`; downloads, cron, health and admin are `no-store`. |
| 3   | Load balancing    | PLATFORM   | Vercel                                                        | ✅    | Vercel routes each request to healthy function instances. |
| 4   | Reverse proxies   | PLATFORM   | Vercel edge network                                           | ✅    | TLS termination, compression, HTTP/2+3 and routing happen at Vercel's edge before our code runs. |
| 5   | API gateway       | BUILD      | `proxy.ts`, `lib/server/api.ts`                                | ✅ M1 | Next 16 renamed `middleware.ts` to `proxy.ts`. Proxy: request id, session refresh, auth gate. `apiRoute()`: origin check, rate limit, zod validation, logging, uniform JSON errors. |
| 6   | CI/CD             | BUILD      | `.github/workflows/ci.yml`, `migrate.yml`                      | ✅ M1 | Lint, format, typecheck, unit, pgTAP, rollback check, type drift, e2e on local Supabase, Docker build, `npm audit`. Vercel previews per PR, production on merge. |
| 7   | Docker            | BUILD      | `Dockerfile`, `docker-compose.yml`, `docs/SELF_HOSTING.md`     | ✅ M1 | Standalone Next.js image, non-root, healthcheck. Compose runs the app against the CLI-managed Supabase stack. |
| 8   | Kubernetes        | NOT NEEDED | —                                                             | ✅    | One stateless app; Vercel already schedules and scales it. Adopt only if self-hosting many services at university scale. |
| 9   | Service discovery | NOT NEEDED | —                                                             | ✅    | One app, one database, fixed URLs in env vars. Needed only with several internal services. |
| 10  | Circuit breakers  | BUILD      | `lib/server/circuit-breaker.ts`, `breaker_*()` (migration 10) | ✅ M8 | Around Resend. State lives in Postgres so every function instance sees the same circuit. 5 provider failures in a row (5xx, 429, timeouts; not 4xx) open it for 5 minutes; jobs are deferred without using up attempts; the next call after that is the trial. Shown on Admin → Operations; an open circuit raises an alert. Tested in `tests/unit/resilience.test.ts`. |
| 11  | Timeouts          | BUILD      | `lib/server/timeout.ts`, all Supabase clients                  | ✅ M8 | Supabase clients 8s, health checks 3s, Resend 10s, TLS check 5s, Google Drive upload 5 min; cron routes `maxDuration = 60` with a 45s queue budget. |
| 12  | Retries           | BUILD      | `lib/server/jobs.ts`, `fail_job()`                             | ✅ M8 | Work is queued, attempted once inline, then retried by the worker (every 30 minutes, and daily) with backoff, up to 6 attempts. Timeouts, 5xx, 429, deadlocks (`40P01`) and serialization failures (`40001`) retry; 4xx and unknown job types dead-letter at once. |
| 13  | Exponential backoff | BUILD    | `lib/backoff.ts` (unit tested)                                | ✅ M3 | `random(0, min(30s × 2^attempt, 1h))` (full jitter). |
| 14  | Idempotency       | BUILD      | `submissions.idempotency_key`, `jobs.idempotency_key`, `metrics_events` unique key, `webhook_events` | ✅ M8 | Duplicate submissions, jobs and view/download events are rejected by unique constraints. The submit form carries one key per attempt; files attach by path; every email has its own idempotency key (Resend ignores repeats); webhook deliveries are processed once per `svix-id`; reminders and alerts are keyed per day. |

## Asynchronous work and events

| #   | Item                     | Status     | Where                                  | State | Notes |
| --- | ------------------------ | ---------- | -------------------------------------- | ----- | ----- |
| 15  | Message queues           | BUILD      | `jobs` table, `claim_jobs()`, `drainQueue()` | ✅ M8 | Postgres table queue: no new vendor, transactional with the data it describes. Workers: the inline attempt, `/api/cron/queue` (GitHub Actions every 30 minutes) and `/api/cron/daily` (Vercel Cron). |
| 16  | Pub/Sub                  | BUILD      | Supabase Realtime, `components/admin/live-notices.tsx` | ✅ M8 | Staff subscribe to `domain_events` inserts; RLS decides who receives which event (editors: submissions, reviews, messages; user events stay Super Admin only). New submissions, revisions, reviews and contact messages pop up live with a link. End-to-end tested. |
| 17  | Event-driven architecture | BUILD     | `domain_events` table                  | ✅ M8 | Every workflow step writes an event (`submission.created`, `review.submitted`, `contact.received`, …) in the same request as the change. Events drive the live notices; emails are queued directly by the same code path (one consumer each, so a separate fan-out worker would add nothing yet). |
| 18  | Distributed transactions | BUILD      | `lib/admin/uploads.ts`, `save_article()`, `set_issue_status()` | ✅ M5 | No two-phase commit. Database changes that belong together run in one SQL function (article + authors; issue + its articles). Files are written to a new storage path first; the database is then pointed at them. Storage is never the source of truth. |
| 19  | Saga pattern             | BUILD      | `attachUpload()` in `lib/admin/uploads.ts` | ✅ M5 | Upload → verify object → record `stored_files` → point entity at it. If either database step fails, the compensations delete the row and the uploaded object. |
| 20  | Dead letter queues       | BUILD      | `dead_letter_jobs`, Admin → Operations | ✅ M8 | Jobs that exhaust retries or can't succeed land here with the error. The Super Admin retries (same idempotency key) or discards each one; both are audited. A non-empty queue raises an alert. |
| 21  | Cron jobs                | BUILD      | `vercel.json`, `.github/workflows/scheduled.yml`, `backup.yml`, `lib/server/cron.ts` | ✅ M8 | Daily (Vercel Cron, works on the free plan): review reminders, metrics rollup, cleanup (orphaned uploads, old jobs/runs/webhooks/rate-limit rows), queue, alerts. Every 30 minutes (GitHub Actions, because Vercel's free plan only allows daily crons): queue, alerts. Weekly (GitHub Actions): backup. Each run is recorded in `cron_runs`; Admin → Operations shows history and has “Run now”. |
| 22  | WebSockets               | PLATFORM   | Supabase Realtime                      | ✅ M8 | The live notices use Realtime's WebSocket; the browser client authenticates with the user's session so RLS applies. |
| 23  | Long polling             | NOT NEEDED | —                                      | ✅    | Realtime covers live updates; if a browser can't hold a WebSocket, the admin falls back to refreshing on focus. |
| 24  | Server-sent events       | DOC        | bulk upload | ✅ M5 | Not needed: uploads go straight from the browser to Storage, so progress comes from the upload itself (XHR progress events). |

## Database

| #   | Item                 | Status     | Where                                   | State | Notes |
| --- | -------------------- | ---------- | --------------------------------------- | ----- | ----- |
| 25  | Indexing             | BUILD      | migrations 1–3                          | ✅ M1 | Every FK, slugs, status + published date (partial, excluding soft-deleted), GIN on `search_vector` and `keywords`, trigram on titles and author names, `metrics_events (article_id, created_at)`. `supabase db lint` clean. |
| 26  | Query optimisation   | BUILD      | `lib/data/*`, RPCs, migration 12        | ✅ M9 | Every query lists its columns. `EXPLAIN ANALYZE` on 2,000 synthetic articles / 4,000 authors (2026-10-17): issue contents 0.1 ms (index), article by slug 0.8 ms (unique index), most read 0.08 ms (partial index), category counts 2.8 ms, search 21 ms. The public author view scanned every author row through a per-row function (86 ms); migration 12 rewrote it as a join: 3.7 ms. |
| 27  | N+1 queries          | BUILD      | data layer, `tests/unit/query-count.test.ts` | ✅ M9 | Every list is a fixed number of queries (authors for any set of articles in one `in()` query; issue labels from the cached issue list). A unit test counts the queries for the issue page, category page, RSS and popular lists with 1 and with 40 articles and fails if they differ. |
| 28  | Connection pooling   | PLATFORM   | Supabase Supavisor                      | ✅    | The app talks to Supabase over HTTPS (PostgREST), which pools internally. Scripts use the pooled URL (port 6543) in `SUPABASE_DB_URL`. |
| 29  | Read replicas        | NOT NEEDED | —                                       | ✅    | Reads are mostly served from the CDN cache. Supabase offers replicas if DB CPU stays above ~70%. |
| 30  | Sharding             | NOT NEEDED | —                                       | ✅    | Thousands of articles, not billions of rows. Never likely for a journal. |
| 31  | Partitioning         | BUILD (alternative) | `metrics_daily`, `rollup_metrics()` | ✅ M8 | Agreed alternative to partitions: daily rollup + 13-month raw retention, run by the daily cron. `rollup_metrics()` is idempotent and deletes only raw days already rolled up. Revisit partitioning if `metrics_events` passes ~50M rows. |
| 32  | Replication          | PLATFORM   | Supabase                                | ✅    | Managed by Supabase (physical backups/WAL). |
| 33  | Leader election      | NOT NEEDED | —                                       | ✅    | Cron runs take a lease (item 38), so only one run of a task proceeds at a time. |
| 34  | CAP theorem          | DOC        | this file                               | ✅    | Single-region Postgres: we choose consistency. If the DB is unreachable, writes fail clearly while cached public pages keep serving. |
| 35  | Eventual consistency | DOC        | this file                               | ✅    | Article view/download counters update in the same transaction as the event. Article pages are cached, so the counts in their HTML can be up to a day old, but the page replaces them with live counts as soon as it loads. Home "most read" lists refresh hourly. Dashboard charts are live. Public pages, sitemap, RSS and sharing images update within seconds of publishing (tag revalidation). |
| 36  | Optimistic locking   | BUILD      | `version` columns, `bump_version()`, `components/admin/conflict-banner.tsx` | ✅ M5 | Every admin save sends the version it loaded; a stale save changes nothing and shows “Someone else edited this. Reload…”. Covered by an end-to-end test. |
| 37  | Pessimistic locking  | BUILD      | `claim_jobs()`, `claim_job()`, `fail_job()` | ✅ M8 | `SELECT … FOR UPDATE SKIP LOCKED`: concurrent workers never take the same job and never wait on each other. |
| 38  | Distributed locks    | BUILD      | advisory locks, `cron_acquire()`        | ✅ M8 | Advisory locks for the last-Super-Admin check, issue publishing and the metrics rollup. Cron tasks take a lease row with a 5-minute expiry (a session advisory lock can't span HTTP calls), so a crashed run can't hold the lock forever. |
| 39  | Race conditions      | BUILD      | constraints, triggers                   | ✅ M1 | Unique slug, unique (volume, issue), unique volume number; last-Super-Admin check serialised with an advisory lock inside the transaction; atomic upsert rate limiter; counters updated in SQL, never read-modify-write in JS. |
| 40  | Deadlocks            | BUILD      | admin SQL functions, `jobs.ts`          | ✅ M8 | Transactions are short and touch rows in one order (issue, then its articles; article, then its authors). The queue worker retries `40P01` and `40001` with backoff. |

## Runtime health

| #   | Item               | Status | Where        | State | Notes |
| --- | ------------------ | ------ | ------------ | ----- | ----- |
| 41  | Memory leaks       | BUILD  | download/upload paths | ✅ M9 | No module-level mutable state (cached data lives in Next's cache, circuit state in Postgres). File bytes never pass through a function: uploads use signed upload URLs, downloads redirect to one-minute signed URLs, and the file-type check reads only the first 64 bytes with a Range request. |
| 42  | Garbage collection | DOC    | this file    | ✅    | Covered by 41: no large in-memory objects in request paths. |
| 43  | Thread safety      | DOC    | this file    | ✅    | Each function instance is single-threaded, but many run concurrently; all shared state is in Postgres. |
| 44  | Backpressure       | BUILD  | `bulk-uploader.tsx`, `drainQueue()` | ✅ M8 | Bulk upload runs at most 3 uploads at once. The worker claims 10 jobs at a time and stops at a 45s budget; emails go one at a time; an open circuit pauses the provider instead of piling on. |

## Scaling and delivery

| #   | Item               | Status   | Where        | State | Notes |
| --- | ------------------ | -------- | ------------ | ----- | ----- |
| 45  | Autoscaling        | PLATFORM | Vercel       | ✅    | |
| 46  | Horizontal scaling | PLATFORM | Vercel       | ✅    | App is stateless (sessions in cookies, state in Postgres). |
| 47  | Vertical scaling   | PLATFORM | Supabase     | ✅    | Dashboard → Project Settings → Compute and Disk; upgrade the compute add-on (minutes of downtime). |
| 48  | CDN                | PLATFORM | Vercel, Supabase Storage CDN | ✅ | |
| 49  | Edge caching       | BUILD    | route config, headers | ✅ M9 | Static pages: `s-maxage` + `stale-while-revalidate` from Next. `/_next/static` immutable. Covers and site images: optimised by `next/image` (AVIF/WebP, cached at the edge) from the public bucket, uploaded with `cache-control: max-age=3600`. API responses cached as in item 2. |
| 50  | Cache invalidation | BUILD    | `lib/admin/revalidate.ts` | ✅ M5 | Every admin mutation calls `updateTag` for the tags it affects (issues, articles, the specific issue/article, categories, pages, board, settings, flags). End-to-end tests check that published changes are live immediately. M7: `sitemap.xml`, `feed.xml` and the OG images read the same tagged loaders, so they refresh with the pages. |

## Releases

| #   | Item                 | Status   | Where                         | State | Notes |
| --- | -------------------- | -------- | ----------------------------- | ----- | ----- |
| 51  | Feature flags        | BUILD    | `feature_flags` table         | ✅ M5 | `submissions_open` (also enforced in RLS), `reviewer_module`, `home_most_read`, `google_sign_in`; toggled in Admin → Settings and audited. |
| 52  | Blue-green           | PLATFORM | Vercel                        | ✅    | Every deployment is immutable; promotion to production is an atomic alias switch. |
| 53  | Canary releases      | DOC      | Vercel                        | ✅    | Staff test on preview URLs. Vercel Rolling Releases (Pro plan) if available; otherwise NOT NEEDED at this traffic. |
| 54  | Rolling deployments  | PLATFORM | Vercel                        | ✅    | |
| 55  | Rollbacks            | BUILD    | Vercel, `supabase/rollbacks/`, file versions | ✅ M9 | App: instant rollback in Vercel. DB: every migration has a `.down.sql`; CI applies all reversals then re-applies migrations. Files: every replaced file stays in `stored_files` and can be restored. Data: weekly backups with a tested restore (item 83). |
| 56  | Health checks        | BUILD    | `/api/health`                 | ✅ M1 | Checks DB and Storage with 3s timeouts; 200 or 503 with per-check latency. |
| 57  | Liveness / readiness | BUILD    | `/api/health/live`, `/api/health/ready` | ✅ M1 | Used by the Docker `HEALTHCHECK` and uptime monitors. |

## Observability

| #   | Item          | Status | Where                                | State | Notes |
| --- | ------------- | ------ | ------------------------------------ | ----- | ----- |
| 58  | Monitoring    | BUILD  | `app/layout.tsx`, Admin → Operations, `docs/RUNBOOK.md` | ✅ M8 | Vercel Analytics + Speed Insights. Admin → Operations shows health, queue, scheduled tasks, failed jobs and email delivery. External uptime monitor (UptimeRobot, free) on `/` and `/api/health`: setup in the runbook. |
| 59  | Logging       | BUILD  | `lib/server/logger.ts`               | ✅ M1 | pino JSON; request id on every API log line; redaction of passwords, tokens, cookies, emails; file contents never logged. |
| 60  | Tracing       | BUILD  | `instrumentation.ts`, `lib/server/tracing.ts` | ✅ M8 | Sentry when `SENTRY_DSN` is set, otherwise `@vercel/otel`. Requests and Supabase fetches are traced automatically; queue jobs (`job.email.send`) and cron tasks (`cron.queue`, …) get their own spans with errors recorded. |
| 61  | Metrics       | BUILD  | `metrics_events`, `error_counts`, `cron_runs`, Operations | ✅ M8 | Business metrics (section 9) on the dashboard. Error rate: every unhandled server error is counted per minute (`onRequestError` and `apiRoute`). Queue depth, oldest waiting job, jobs completed in 24h, failed jobs, email failures (dead letters and the Resend circuit) on Admin → Operations. Request latency: Vercel Observability (and Speed Insights for real users); measured figures below. |
| 62  | Alerts        | BUILD  | `lib/ops/alerts.ts`, alerts task, UptimeRobot | ✅ M8 | Emailed to `ALERT_EMAIL`, at most once a day per alert: dependency down, ≥25 server errors in an hour, failed jobs, jobs waiting over an hour, provider circuit open, queue or daily task stale, no backup for 8 days (or never), TLS certificate expiring within 14 days. “Site down” comes from the external uptime monitor (it can't come from the site itself). Rules are unit tested. |
| 63  | SLOs          | DOC    | below                                | ✅    | 99.5% monthly availability; p95 public page load < 2.5s; p95 download start < 1s. |
| 64  | SLIs          | DOC    | below                                | ✅ M8 | See “SLOs, SLIs and error budget”. |
| 65  | Error budgets | DOC    | below                                | ✅ M8 | 0.5% of a 30-day month = 3h 36m. Policy below. |
| 66  | Observability summary | DOC | below                             | ✅ M8 | See “How logs, metrics, traces and alerts fit together”. |

## Security

| #   | Item                  | Status   | Where                                    | State | Notes |
| --- | --------------------- | -------- | ---------------------------------------- | ----- | ----- |
| 67  | Secrets management    | BUILD    | `.env.example`, `lib/env.*.ts`           | ✅ M1 | Secrets only in Vercel/GitHub env settings. Server secrets live in `lib/env.server.ts`, which imports `server-only`, so a client import fails the build. Rotation: see below. |
| 68  | IAM                   | BUILD    | migration 4, `lib/supabase/admin.ts`     | ✅ M1 | Roles in `profiles`; RLS on every table; 28 pgTAP tests. Service-role client only in server files. |
| 69  | OAuth                 | BUILD    | `supabase/config.toml`, login page       | ✅ M4 | Google provider in `supabase/config.toml` (off until a client id/secret is set); the button and action are behind the `google_sign_in` feature flag. |
| 70  | JWT rotation          | PLATFORM | Supabase Auth, `proxy.ts`                | ✅    | 1h access tokens, rotating refresh tokens (`enable_refresh_token_rotation`). Proxy refreshes sessions with `getUser()`. Signing keys: Dashboard → Project Settings → JWT Keys → rotate. |
| 71  | TLS                   | PLATFORM | Vercel; `Strict-Transport-Security`      | ✅    | HTTPS only; HSTS 2 years with preload. |
| 72  | Encryption at rest    | PLATFORM | Supabase                                 | ✅    | AES-256 for database and storage. |
| 73  | Encryption in transit | PLATFORM | Vercel, Supabase                         | ✅    | TLS from browser to Vercel and from functions to Supabase. |
| 74  | WAF                   | PLATFORM | Vercel Firewall                          | 🟡 M9 | Set up after deployment (runbook, “One-time setup → Firewall”): turn on the Vercel Firewall's bot protection and keep “Attack Challenge Mode” ready for an attack. The app's own rate limits (item 1) apply regardless. Cloudflare in front is possible if UNN ICT allows it, but not needed. |
| 75  | DDoS protection       | PLATFORM | Vercel                                   | ✅    | Plus rate limiting (item 1). |
| 76  | CORS                  | BUILD    | `lib/server/api.ts`                      | ✅ M1 | No CORS headers by default (same-origin only); `publicCors` only for `/api/v1/*`. |
| 77  | CSRF                  | BUILD    | `lib/server/api.ts`                      | ✅ M1 | Mutating route handlers reject foreign `Origin`; Server Actions have Next's built-in origin check; Supabase cookies are `SameSite=Lax`. |
| 78  | SQL injection         | BUILD    | all data access                          | ✅ M1 | Only the parameterised Supabase client and RPCs. Every SECURITY DEFINER function has `set search_path = ''`. |
| 79  | XSS                   | BUILD    | `lib/sanitize.ts`, `lib/security/headers.ts` | ✅ M9 | All rich text is sanitised on save and again on render (sanitize-html allow-list); every `dangerouslySetInnerHTML` goes through it (the security review checked each one). Abstracts copied from submissions and the API's `abstract_html` are sanitised too. JSON-LD escapes `<`. Strict CSP (`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`); inline scripts are allowed because nonces would make every page dynamic. Uploads must match their declared type by content (magic bytes), so HTML can't be stored as a “PDF”. |
| 80  | SSRF                  | BUILD    | —                                        | ✅    | The server makes no requests to user-supplied URLs. Allow-list helper added if ORCID lookup is built. |
| 81  | Database migrations   | BUILD    | `supabase/migrations`, `migrate.yml`     | ✅ M1 | |
| 82  | Schema versioning     | BUILD    | `schema_version()` RPC                   | ✅ M5 | Shown at the bottom of Admin → Settings. |

### Secret rotation

| Secret | Where to rotate | Then |
| ------ | --------------- | ---- |
| `SUPABASE_SERVICE_ROLE_KEY`, anon key | Supabase → Project Settings → API Keys (create new key, revoke old) | Update in Vercel (Production + Preview), redeploy |
| JWT signing key | Supabase → Project Settings → JWT Keys → Rotate | Users stay signed in (old key remains valid until expiry) |
| `METRICS_SALT` | `openssl rand -hex 24` | Update in Vercel; existing rate-limit windows reset (harmless) |
| `CRON_SECRET` | `openssl rand -hex 24` | Update in Vercel **and** the GitHub secret of the same name; redeploy |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Resend dashboard (API keys; Webhooks → signing secret) | Update in Vercel |
| `SENTRY_DSN` | Sentry → Project → Client Keys | Update in Vercel |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` | Supabase account tokens / Database settings | Update GitHub repository secrets |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Google Cloud console → Credentials; OAuth Playground (runbook, “Backups”) | Update GitHub repository secrets; run the Backup workflow by hand to check |

## Resilience and recovery

| #   | Item                   | Status   | Where             | State | Notes |
| --- | ---------------------- | -------- | ----------------- | ----- | ----- |
| 83  | Disaster recovery      | BUILD    | `docs/RUNBOOK.md`, `scripts/restore-backup.sh`, `scripts/restore-files.mjs` | ✅ M8 | RPO 24h (Supabase daily backups on Pro; weekly own backups otherwise, see 84), RTO 4h. Restore drill done on 2026-10-17: a full dump was restored into an empty database; every row count matched, all 70 database tests passed and sign-in worked. The drill found that the dump's schema misses objects outside `public` (the new-user trigger, storage policies), so restores rebuild the schema from the migrations and load only the data. |
| 84  | Backups                | PLATFORM + BUILD | Supabase; `.github/workflows/backup.yml` | ✅ M8 | PLATFORM: Supabase daily backups (7 days on Pro; PITR is an add-on). BUILD: weekly database dump (roles, schema, data, file list, commit and schema version) and monthly copy of every stored file, uploaded to the journal's Google Drive (12 weekly + 3 monthly kept) and kept 30 days as GitHub artifacts. The site alerts if no backup succeeds for 8 days. On the free Supabase plan, which has no backups, these are the only backups, so the weekly job matters. |
| 85  | Failover               | DOC      | below             | ✅ M8 | See “Failover: what happens when each part goes down”. |
| 86  | Multi-region           | NOT NEEDED | —               | ✅    | Readers are global but pages come from the CDN; one region for data is simpler and consistent. Adopt only if an SLO above 99.9% is required. |
| 87  | Chaos engineering      | NOT NEEDED (+ tests) | `tests/unit/resilience.test.ts`, `004_operations.test.sql` | ✅ M8 | Not practised on production. Tests simulate Resend failing (503, timeout, 422, circuit open, breaker state unreadable) and Storage failing (downloads answer 503 with `Retry-After`, not a crash), plus worker crashes (stale job release) in SQL. |
| 88  | Cost optimisation      | BUILD    | below             | ✅ M8 | See “Expected monthly cost”. |

## Performance

| #   | Item               | Status | Where | State | Notes |
| --- | ------------------ | ------ | ----- | ----- | ----- |
| 89  | Cold starts        | BUILD  | public bundles | ✅ M9 | Public pages ship only the framework plus small client components: in M9 the Supabase client (≈250 KB) and zod (≈100 KB) were removed from public pages (the account link reads the session cookie; public env checks don't use zod). Sentry loads only when configured. The edge runtime isn't used: Next 16's `proxy.ts` and Cache Components run on Node, and the light routes (health, redirects) already answer in tens of milliseconds. |
| 90  | Serverless limits  | BUILD  | `lib/admin/upload-client.ts` | ✅ M5 | Files go browser → Supabase Storage through signed upload URLs (up to 100 MB per file); no file passes through a Vercel function. Resumable (TUS) uploads can be added if editors upload over unreliable connections. |
| 91  | Latency            | DOC    | below, `scripts/measure.sh` | 🟡 M9 | Measured locally (below). Run `scripts/measure.sh https://awlel.unn.edu.ng` after deployment to record production figures here. |
| 92  | Throughput         | DOC    | below | 🟡 M9 | As above. |
| 93  | P99 latency        | DOC    | below | 🟡 M9 | As above. |
| 94  | Tail latency       | DOC    | below | 🟡 M9 | As above, with the main tail causes and what limits them. |
| 95  | Network partitions | BUILD  | `lib/data/catalog.ts`, `app/**/error.tsx` | ✅ M9 | If Supabase is unreachable, cached public pages keep serving; uncached ones show a friendly error page with a reference; the admin shows “the dashboard can't load this right now… anything you saved is safe”; downloads answer 503 with `Retry-After`; email waits in the queue. |
| 96  | Clock skew         | BUILD  | migrations | ✅ M1 | All timestamps default to `now()` in Postgres; triggers set `updated_at`. |
| 97  | DNS                | DOC    | `docs/DOMAIN_SETUP.md`, README | ✅ M9 | Step-by-step guide for the journal's own domain: the A/CNAME records Vercel shows (or Vercel nameservers), and the SPF, DKIM (Resend) and DMARC records so site email isn't marked as spam. Notes the same records for `awlel.unn.edu.ng` if UNN ICT hosts it later. |
| 98  | TCP vs UDP         | NOT NEEDED | — | ✅ | Platform level; HTTP/3 (QUIC over UDP) is negotiated by Vercel automatically. |
| 99  | HTTP/2 and HTTP/3  | PLATFORM | Vercel | ✅ | |
| 100 | gRPC               | NOT NEEDED | — | ✅ | No internal services. |
| 101 | Webhooks           | BUILD  | `app/api/webhooks/resend/route.ts`, `lib/ops/signatures.ts` | ✅ M8 | Resend delivery webhooks: Svix signature verified (constant-time, 5-minute replay window), processed once per delivery id, hard bounces and complaints suppress the address (Admin → Operations can allow it again). Resend retries failed deliveries. No Supabase database webhooks are used. |

## APIs, infrastructure and operations

| #   | Item                   | Status     | Where                          | State | Notes |
| --- | ---------------------- | ---------- | ------------------------------ | ----- | ----- |
| 102 | API versioning         | BUILD      | `/api/v1/*`, `lib/api/v1.ts`   | ✅ M8 | Read-only JSON for indexers and partners: `/api/v1/issues`, `/issues/{volume}/{issue}`, `/articles`, `/articles/{slug}` (with APA/MLA/BibTeX), `/categories`. Published content only, author emails only where shown publicly, CORS `*`, CDN-cached, rate limited. Breaking changes go to `/api/v2`. (Was planned for M7; built in M8.) |
| 103 | Semantic versioning    | BUILD      | `CHANGELOG.md`, git tags       | ✅ M1 | |
| 104 | Infrastructure as code | BUILD      | `supabase/config.toml`, migrations, `vercel.json`, workflows | ✅ M8 | Database, storage buckets and policies, realtime publication, cron schedules, CI, migrations, backups and the 15-minute worker are all in git. Not in git: secrets and the external uptime monitor (documented in the runbook). |
| 105 | Terraform              | NOT NEEDED | —                              | ✅    | Item 104 recreates everything from git. Consider Terraform's Vercel/Supabase providers only if managing several environments. |
| 106 | Helm charts            | NOT NEEDED | —                              | ✅    | No Kubernetes. |
| 107 | Build caching          | BUILD      | `ci.yml` (npm + `.next/cache`), Docker BuildKit cache | ✅ M1 | Vercel's build cache is on by default. |
| 108 | Dependency hell        | BUILD      | `package-lock.json`, `dependabot.yml`, `npm audit` in CI | ✅ M1 | Majors pinned; Dependabot ignores major bumps. |
| 109 | Production incidents   | BUILD      | `docs/RUNBOOK.md`              | ✅ M8 | Detect, triage, communicate, fix: site down or erroring, uploads failing, emails not arriving, wrong file published, certificate, backups, a failed migration. |
| 110 | On-call                | DOC        | `docs/RUNBOOK.md`              | ✅ M8 | Alerts go to `ALERT_EMAIL` (the Super Admin). Escalation: the department's web contact, then UNN ICT for DNS. Contacts table in the runbook. |
| 111 | Postmortems            | BUILD      | `docs/POSTMORTEM_TEMPLATE.md`  | ✅ M8 | Blameless; what happened, impact, timeline, root cause, what went well, action items with owners. |

## SLOs, SLIs and error budget

| SLO (item 63) | SLI: how it is measured (item 64) | Where to look |
| ------------- | --------------------------------- | ------------- |
| **99.5% monthly availability** of the public site | Share of 1-minute checks of `/` and `/api/health` that succeed (HTTP 200 within 30s), from the external uptime monitor. `/api/health` fails if the database or storage does not answer in 3s. | UptimeRobot monthly report |
| **p95 public page load under 2.5s** | Largest Contentful Paint at the 75th and 95th percentile from real visitors (Vercel Speed Insights), public routes only. | Vercel → Speed Insights |
| **p95 download start under 1s** | Server time of `/api/download/*` responses (the redirect to the file), p95 over 28 days, from Vercel's function metrics. The file transfer itself is the CDN's and the reader's connection. | Vercel → Observability → `/api/download/*` |

**Error budget (item 65).** 99.5% of a 30-day month allows **3 hours 36 minutes** of downtime (about 50 minutes a
week). Downtime counts from the uptime monitor; planned maintenance counts too.

- **Under half spent:** work as normal.
- **Over half spent within a month:** the next change is reliability work (fix the cause in the postmortem's
  action items) before new features. Migrations are applied only with a tested rollback.
- **Spent:** freeze feature releases until the next month starts; only fixes, security updates and content
  publishing go out. Write a postmortem (`docs/POSTMORTEM_TEMPLATE.md`) for every incident that used budget.

## How logs, metrics, traces and alerts fit together

One page for whoever is looking after the site (item 66).

- **Logs** (pino JSON to stdout → Vercel → Logs). Every API request logs one line with its `requestId`, status
  and duration; the same id is returned to the browser in `x-request-id` and shown in error messages, so a
  reader's report can be matched to the log line. Passwords, tokens, cookies, emails and file contents are
  redacted or never logged. Alerts also write an `ALERT:` log line.
- **Metrics.** Business metrics (views, downloads, submissions) on the Admin dashboard. Operational metrics
  on Admin → Operations: dependency latency, queue depth, oldest waiting job, failed jobs, email circuit,
  scheduled task history; error counts per minute in `error_counts`. Request latency and function errors in
  Vercel Observability; real-user page speed in Speed Insights.
- **Traces.** OpenTelemetry spans for every request, Supabase call, queue job and cron task, sent to Sentry if
  `SENTRY_DSN` is set, otherwise to Vercel (`@vercel/otel`). A slow request's trace shows which query or
  provider call took the time.
- **Alerts.** Two independent sources so one failure can't silence both: the **external uptime monitor**
  (site down; it emails the Super Admin), and the **alert check** inside the site (every 30 minutes and daily),
  which emails `ALERT_EMAIL` about errors, failed jobs, stuck queues, an open circuit, stale schedules, missing
  backups and certificate expiry, once a day per problem. Each alert names the runbook section to follow.
- **Path of an investigation:** alert email → runbook section → Admin → Operations (what is red) → Vercel Logs
  filtered by `requestId` or error → trace for the slow or failing step → fix → postmortem.

## Measured performance

Items 91–94. Measured on 2026-10-17 against a local production build (`next build && next start`, 4 vCPU) with
the local Supabase stack, using autocannon (10 connections, 15 seconds; API and downloads kept under their
rate limits). These numbers measure the app's own work; production adds network distance, and static pages
are then served by Vercel's CDN instead of Node. Run `scripts/measure.sh https://awlel.unn.edu.ng` after deployment to add production figures.

| Route | Kind | Throughput | p50 | p90 | p99 | Max |
| ----- | ---- | ---------- | --- | --- | --- | --- |
| `/` | static, cached | 505 req/s | 17 ms | 29 ms | 47 ms | 90 ms |
| `/articles/[slug]` | static, cached | 497 req/s | 17 ms | 30 ms | 43 ms | 60 ms |
| `/issues` | static, cached | 577 req/s | 15 ms | 25 ms | 39 ms | 52 ms |
| `/search?q=igbo` | dynamic, full-text search | 45 req/s | 220 ms | 267 ms | 356 ms | 464 ms |
| `/api/v1/issues` | dynamic, cached data | 140 req/s* | 18 ms | 25 ms | 33 ms | 33 ms |
| `/api/download/article/[id]` | dynamic: check, count, sign, redirect | 55 req/s* | 60 ms | 75 ms | 81 ms | 81 ms |
| `/api/health` | DB + storage checks | 220 req/s | 41 ms | 56 ms | 76 ms | 520 ms |

\* limited by the test staying under the route's rate limit, not by the server.

**Tail latency (item 94).** The worst cases come from: (1) the first request after a deploy or a cache
expiry, which renders the page and queries Supabase (the 520 ms health outlier is a cold connection);
(2) search, which runs full-text queries on every request; (3) Supabase cold starts on the free plan after
inactivity. Limits in place: cached pages are served stale while they refresh (`stale-while-revalidate`), so
readers rarely wait for a render; every outbound call has a timeout (item 11), so a slow dependency can't hold
a request longer than 8s; search is rate limited. The SLO targets (2.5s page load, 1s download start) have
large headroom over these figures.

## Failover: what happens when each part goes down

Item 85. Both platforms run on infrastructure with automatic hardware failover; the question is what readers
and editors see if a whole service is unavailable.

| If this is down | Readers | Editors and authors | Recovers |
| --------------- | ------- | ------------------- | -------- |
| **One Vercel region or edge node** | Nothing visible: traffic moves to the next edge location. | Same. | Automatically. |
| **Vercel functions** (rare, platform incident) | Cached pages keep loading from the CDN; search, downloads and sign-in fail. | Admin unavailable. | When Vercel recovers; nothing to do. |
| **Supabase database** | Cached pages keep loading; downloads, search and view counts fail with a clear message; `/api/health` returns 503 and the uptime monitor alerts. | Admin shows "service unavailable"; nothing is half-saved (each save is one transaction). | Supabase restores the instance (on Pro, from its standby/backups). If the project is lost: runbook, "Restore from a backup" (RTO 4h). |
| **Supabase Storage** | Pages load; downloads answer "the file store is not responding, try again" (503). | Uploads fail with a message; nothing is recorded until the file is stored. | Automatically; the daily cleanup removes any half-finished uploads. |
| **Resend (email)** | Not affected. | Emails wait in the queue; after 5 failures the circuit pauses sending and retries every 5 minutes; nothing is lost and nothing is sent twice. | Automatically when Resend recovers. |
| **GitHub Actions** | Not affected. | Retries wait for the daily run instead of every 30 minutes; backups wait. Alerts fire if this lasts. | Automatically. |
| **Google Drive** | Not affected. | The backup still exists as a GitHub artifact for 30 days; the failed run alerts. | Re-run the Backup workflow. |

## Expected monthly cost

Item 88. Prices as of October 2026; check the providers' pricing pages before deciding.

| Service | Plan | Monthly cost | Why |
| ------- | ---- | ------------ | --- |
| Vercel | Hobby (free) or Pro | $0 or $20 | Hobby covers this traffic, but its terms are for non-commercial use and it allows daily crons only (handled with GitHub Actions). Pro adds team access, rolling releases and more function time. |
| Supabase | **Pro** recommended | $25 | Free has 500 MB database, 1 GB storage, no backups and pauses after a week of inactivity. Twenty-five years of PDFs and Word files (roughly 2–4 GB) need Pro's 100 GB storage, and Pro adds daily backups. |
| Resend | Free | $0 | 3,000 emails a month, 100 a day: far above a journal's submission and review emails. |
| Domain for email | — | about $1 | About $10–15 a year for the sending domain. `awlel.unn.edu.ng` itself is free from UNN. |
| GitHub | Free | $0 | Actions: about 1,450 minutes a month for the queue worker + backups, inside the 2,000 free minutes (unlimited if the repository is public). |
| Google Drive | Free (15 GB) | $0 | 12 weekly database backups (a few MB each) + 3 monthly file archives. Upgrade to 100 GB (about $2) once the file archives approach 4 GB each. |
| UptimeRobot | Free | $0 | 50 monitors, 5-minute checks. |
| Sentry | Optional | $0 | Free developer plan if used. |
| **Total** | | **about $26–46** | $26 with Vercel Hobby, $46 with Vercel Pro. |

Cost controls already in place: static pages and API responses are cached at the CDN; images are served by
Next's optimiser at the sizes needed; raw view and download events are kept 13 months then rolled up; finished
jobs, cron history and webhook records are deleted after 30–90 days; abandoned uploads are deleted after a
day; files never pass through functions.

## Quality bar (section 15) — results

### Lighthouse

Measured 2026-10-17 on a local production build with `scripts/measure.sh` (Lighthouse 12; mobile = simulated
mid-range phone on slow 4G with 4× CPU slowdown; desktop = Lighthouse's desktop preset). Scores: performance,
accessibility, best practices, SEO.

| Page | Mobile | Desktop |
| ---- | ------ | ------- |
| Home | 90–95 · 100 · 100 · 100 | 100 · 100 · 100 · 100 |
| Archive | 94–97 · 100 · 100 · 100 | 100 · 100 · 100 · 100 |
| Issue | 92–97 · 100 · 100 · 100 | 100 · 100 · 100 · 100 |
| Article | 92–96 · 100 · 100 · 100 | 99–100 · 100 · 100 · 100 |
| About | 92–95 · 100 · 100 · 100 | 100 · 100 · 100 · 100 |
| Contact | 96–98 · 100 · 100 · 100 | 100 · 100 · 100 · 100 |
| Search results | 97 · 100 · 100 · 66 | 100 · 100 · 100 · 66 |

- Accessibility, best practices and SEO are 100 on every page. Search results score 66 for SEO on purpose: they
  are marked `noindex` so search engines index articles, not result lists.
- Desktop performance is 99–100. **Mobile performance is 90–98**, against the target of 95: the score moves
  between runs by about ±4, and its main cost is downloading and starting React's runtime (~150 KB compressed)
  on the simulated slow phone. Real-browser timings are far lower (first paint and largest paint ≈ 0.2 s
  unthrottled). Fixes made in M9: removed the Supabase client and zod from public pages (−400 KB of
  JavaScript), stopped preloading the large serif font files, removed two layout shifts (the article page's
  loading skeleton let the footer jump, CLS 0.31 → 0; the hero text reflowed when the serif font arrived).
  Production on Vercel adds Brotli compression and HTTP/2 from the edge; re-run `scripts/measure.sh` there.

### Accessibility (WCAG 2.1 AA)

- `tests/e2e/a11y.spec.ts` runs axe-core (WCAG 2.0/2.1 A and AA rules) on 17 public pages, on desktop and on a
  phone, and on 18 admin pages: no violations. M9 fixed: link names that didn't contain their visible text
  (logo, share buttons, hero cover), an under-contrast cover badge, links in running text distinguished by colour
  only (now underlined), and a scrollable preview that couldn't be reached by keyboard.
- Built in from the start: skip link, one visible focus ring, landmarks and headings, labelled form fields with
  inline errors announced to screen readers, `prefers-reduced-motion`, 44 px header and menu buttons, the chart's keyboard
  read-out and table view.
- Automated checks find about half of real issues. Before launch, check by hand with a keyboard only and with a
  screen reader (NVDA on Windows or VoiceOver) on: submitting a manuscript, reviewing, and publishing an issue.

### Security review against section 16

An independent read-only review of every server action, route handler, RLS policy, storage policy and
security-definer function (2026-10-17). No critical or high findings. Fixed in M9:

| Finding | Severity | Fix |
| ------- | -------- | --- |
| `?next=` after sign-in could redirect off-site with a tab character (`/\t/evil.com`) | Medium | `safeNextPath` rejects control characters and checks the resolved origin; unit tested |
| Reviewers could read file rows (original names, storage paths, uploader) and list the submissions bucket, which could reveal the author or other reviewers | Medium | Reviewers read no file rows; `reviewer_files()` returns ids and versions only; direct bucket access removed for authors and reviewers; new uploads stored under neutral names; pgTAP tested |
| Authors could write arbitrary timeline notes | Low | `add_submission_note` is staff-only; authors use `record_revision`, which checks the file and status and records once |
| Author HTML could reach the public API unsanitised | Low | Sanitised when an article is created from a submission and in the API |
| Reviewers could attach someone else's file or change bookkeeping columns | Low | Trigger checks the annotated file is theirs and on the same submission |
| Schema version readable anonymously | Low | Revoked from `anon` |
| `/api/health` returned raw error text | Low | Generic per-dependency status; details logged; rate limited |
| File type trusted from the name and declared MIME type | Low | Content must match (magic bytes) for every upload; tested |

Accepted, documented: IP-based limits depend on the proxy setting client-IP headers (true on Vercel; see item 1);
`METRICS_SALT` falls back to the Supabase JWT secret until set, so set it in production. Also checked and fine:
every server action validates with zod and checks role or ownership; every service-role use comes after that
check; all security-definer functions set `search_path`; no `any` in the code; no server-side fetch of
user-supplied URLs; secrets never reach client bundles; CSRF covered by Server Action origin checks, `apiRoute`'s
Origin check and signed or bearer-protected machine endpoints.

### Tests

| Kind | Count | Covers |
| ---- | ----- | ------ |
| Unit (Vitest) | 76 | citations (APA, MLA, BibTeX, RIS), issue labels, roles and redirects, slugs, CSV and bulk matching, file rules and signatures, SEO tags and JSON-LD, bots, alerts, webhook signatures, failure drills, N+1 query counts |
| Database (pgTAP) | 82 | RLS for every role, triggers, review blinding, analytics, queue and cron functions, M9 security rules |
| End to end (Playwright) | 79 + 35 a11y | browse archive → issue → article → download; author submits; editor assigns a reviewer; reviewer submits a review; editor publishes an article; Super Admin changes a role; bulk upload; stale edits; analytics; operations; API; accessibility |

## Data model changes from the brief

| Change | Why |
| ------ | --- |
| `stored_files` table; issues/articles reference `*_file_id` instead of `*_path` | Records file name, size, type and upload date (section 8), and keeps every previous version for rollback: the entity points at the current row, older rows stay. |
| `published-files` bucket is private; downloads use signed URLs | Draft files can never be fetched by guessing a path; every download is counted. |
| `article_authors` read publicly through the `public_article_authors` view | RLS is row-level; the view hides `email` unless `show_email` is set. |
| `editorial_board_groups` table instead of free-text `role_group` | Groups can be renamed and reordered once, not per member. |
| `department_milestones` table | Backs the optional timeline on The Department page. |
| `search_vector` maintained by trigger, not a generated column | It includes author names from another table, which a generated column cannot reference. |
| `version` column on editable tables | Optimistic locking (item 36). |
| `submissions.idempotency_key`, `declarations`, `article_id` | Duplicate-safe submits (item 14), stored declarations, link to the published article. |
| `review_assignments` has `pending/submitted/withdrawn` status and a reminder timestamp | Due-date reminders (item 21) and withdrawing a reviewer without deleting history. |
| `metrics_events.event_day` + unique key; `metrics_daily` | De-duplication per session per day; rollup replaces partitioning (item 31). |
| Extra operational tables: `domain_events`, `jobs`, `dead_letter_jobs`, `feature_flags`, `rate_limits`; M8: `cron_runs`, `cron_leases`, `circuit_breakers`, `email_suppressions`, `webhook_events`, `error_counts` | Items 1, 10, 15, 17, 20, 21, 38, 51, 61, 101. |
| Reviewers have no direct access to `submissions` | Blinding is enforced by the database, not the UI: reviewers read only the blinded `reviewer_queue()` projection, and download manuscripts under a neutral name (M6). |

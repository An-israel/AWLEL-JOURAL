# Engineering decisions

How each of the 111 production concerns in the brief (section 16) is handled. **Status** is one of:

- **BUILD**: implemented in this repository.
- **PLATFORM**: provided by Vercel or Supabase; configured and documented here.
- **NOT NEEDED**: does not apply at this size; the note says why and what would change that.

**State** shows progress: ✅ done, 🟡 partly done, ⏳ planned for the milestone shown. This file is
completed in milestone 8; rows marked ⏳ are filled in as each milestone lands.

Architecture in one paragraph: a single stateless Next.js app on Vercel (static pages served from the CDN,
serverless functions for everything dynamic) talking to one Supabase project (Postgres with Row Level
Security, Auth, Storage, Realtime) in one region. All shared state lives in Postgres. Background work goes
through a Postgres job queue drained by cron. There are no other services.

## Traffic, caching and delivery

| #   | Item              | Status     | Where                                                         | State | Notes |
| --- | ----------------- | ---------- | ------------------------------------------------------------- | ----- | ----- |
| 1   | Rate limiting     | BUILD      | `lib/server/rate-limit.ts`, `check_rate_limit()` in migration 3 | 🟡 M1 | Postgres fixed-window limiter (no extra vendor). Returns 429 + `Retry-After` via `apiRoute`. Applied so far to login, sign-up and password reset (per IP and per account) and the contact form; submission (M6) and download (M7) follow. Keys are HMAC-hashed; never raw IPs. Fails open if the DB is down. |
| 2   | Caching           | BUILD      | `next.config.ts` (`cacheComponents`), `lib/data/*`             | 🟡 M1 | Public pages are static shells with `"use cache"` data tagged by entity (`lib/data/tags.ts`). Next 16 replaces `unstable_cache` with `"use cache"` + `cacheTag`; same behaviour. API `Cache-Control` set per route. |
| 3   | Load balancing    | PLATFORM   | Vercel                                                        | ✅    | Vercel routes each request to healthy function instances. |
| 4   | Reverse proxies   | PLATFORM   | Vercel edge network                                           | ✅    | TLS termination, compression, HTTP/2+3 and routing happen at Vercel's edge before our code runs. |
| 5   | API gateway       | BUILD      | `proxy.ts`, `lib/server/api.ts`                                | ✅ M1 | Next 16 renamed `middleware.ts` to `proxy.ts`. Proxy: request id, session refresh, auth gate. `apiRoute()`: origin check, rate limit, zod validation, logging, uniform JSON errors. |
| 6   | CI/CD             | BUILD      | `.github/workflows/ci.yml`, `migrate.yml`                      | ✅ M1 | Lint, format, typecheck, unit, pgTAP, rollback check, type drift, e2e on local Supabase, Docker build, `npm audit`. Vercel previews per PR, production on merge. |
| 7   | Docker            | BUILD      | `Dockerfile`, `docker-compose.yml`, `docs/SELF_HOSTING.md`     | ✅ M1 | Standalone Next.js image, non-root, healthcheck. Compose runs the app against the CLI-managed Supabase stack. |
| 8   | Kubernetes        | NOT NEEDED | —                                                             | ✅    | One stateless app; Vercel already schedules and scales it. Adopt only if self-hosting many services at university scale. |
| 9   | Service discovery | NOT NEEDED | —                                                             | ✅    | One app, one database, fixed URLs in env vars. Needed only with several internal services. |
| 10  | Circuit breakers  | BUILD      | `lib/server/circuit-breaker.ts`                                | ⏳ M8 | Around Resend and any third-party API; open circuit queues the work instead of failing the request. |
| 11  | Timeouts          | BUILD      | `lib/server/timeout.ts`, all Supabase clients                  | 🟡 M1 | Every Supabase client uses an 8s fetch timeout; health checks 3s. Email and other outbound calls get timeouts as they are added. |
| 12  | Retries           | BUILD      | `lib/server/jobs.ts`                                          | 🟡 M3 | Work is queued, attempted once inline, and left queued with a backoff if it fails; non-retryable provider errors (4xx) dead-letter at once. The cron worker that drains retries arrives in M8. |
| 13  | Exponential backoff | BUILD    | `lib/backoff.ts` (unit tested)                                | ✅ M3 | `random(0, min(30s × 2^attempt, 1h))` (full jitter). |
| 14  | Idempotency       | BUILD      | `submissions.idempotency_key`, `jobs.idempotency_key`, `metrics_events` unique key | 🟡 M1 | Schema enforces it now: duplicate submissions, jobs and view/download events are rejected by unique constraints. Upload idempotency in M6. |

## Asynchronous work and events

| #   | Item                     | Status     | Where                                  | State | Notes |
| --- | ------------------------ | ---------- | -------------------------------------- | ----- | ----- |
| 15  | Message queues           | BUILD      | `jobs` table (migration 3)             | 🟡 M1 | Postgres table queue: no new vendor, transactional with the data it describes. Workers in M8. |
| 16  | Pub/Sub                  | BUILD      | Supabase Realtime                      | ⏳ M8 | Staff get live notices for new submissions, reviews, messages. |
| 17  | Event-driven architecture | BUILD     | `domain_events` table                  | 🟡 M1 | Table exists; events are written by each feature and fanned out to jobs in M8. |
| 18  | Distributed transactions | BUILD      | publish flow                            | ⏳ M5 | No 2PC. Files are uploaded first under a new path; the DB row is switched in one transaction; storage is never the source of truth. |
| 19  | Saga pattern             | BUILD      | publish / upload flows                  | ⏳ M5 | Each step has a compensation (e.g. delete orphaned upload if the DB write fails). |
| 20  | Dead letter queues       | BUILD      | `dead_letter_jobs` table, admin screen  | 🟡 M1 | Table + RLS (Super Admin read/resolve) now; screen in M8. |
| 21  | Cron jobs                | BUILD      | `vercel.json` crons                     | ⏳ M8 | Queue drain, review reminders, metrics rollup, orphan cleanup, weekly backup export. |
| 22  | WebSockets               | PLATFORM   | Supabase Realtime                      | ⏳ M8 | |
| 23  | Long polling             | NOT NEEDED | —                                      | ✅    | Realtime covers live updates; if a browser can't hold a WebSocket, the admin falls back to refreshing on focus. |
| 24  | Server-sent events       | BUILD/DOC  | bulk upload                             | ⏳ M5 | Uploads go browser → Storage directly, so progress is known in the browser; SSE unnecessary. Documented then. |

## Database

| #   | Item                 | Status     | Where                                   | State | Notes |
| --- | -------------------- | ---------- | --------------------------------------- | ----- | ----- |
| 25  | Indexing             | BUILD      | migrations 1–3                          | ✅ M1 | Every FK, slugs, status + published date (partial, excluding soft-deleted), GIN on `search_vector` and `keywords`, trigram on titles and author names, `metrics_events (article_id, created_at)`. `supabase db lint` clean. |
| 26  | Query optimisation   | BUILD      | `lib/data/*`, RPCs                      | 🟡 M2 | Every query lists its columns; category counts and search are SQL functions (`categories_with_counts`, `search_articles`). `EXPLAIN ANALYZE` results are recorded once real issues are imported (a 3-article sample gives meaningless plans). |
| 27  | N+1 queries          | BUILD      | data layer + test                       | 🟡 M2 | `lib/data/catalog.ts`: every list is a fixed number of queries. Authors for any set of articles come from one `in()` query; issue labels come from the cached issue list. An automated query-count check is added with the M9 test pass. |
| 28  | Connection pooling   | PLATFORM   | Supabase Supavisor                      | ✅    | The app talks to Supabase over HTTPS (PostgREST), which pools internally. Scripts use the pooled URL (port 6543) in `SUPABASE_DB_URL`. |
| 29  | Read replicas        | NOT NEEDED | —                                       | ✅    | Reads are mostly served from the CDN cache. Supabase offers replicas if DB CPU stays above ~70%. |
| 30  | Sharding             | NOT NEEDED | —                                       | ✅    | Thousands of articles, not billions of rows. Never likely for a journal. |
| 31  | Partitioning         | BUILD (alternative) | `metrics_daily`, retention job | 🟡 M1 | Agreed alternative to partitions: daily rollup table + 13-month raw retention (cron in M8). Revisit partitioning if `metrics_events` passes ~50M rows. |
| 32  | Replication          | PLATFORM   | Supabase                                | ✅    | Managed by Supabase (physical backups/WAL). |
| 33  | Leader election      | NOT NEEDED | —                                       | ✅    | Cron jobs take a Postgres advisory lock so only one run proceeds (item 38). |
| 34  | CAP theorem          | DOC        | this file                               | ✅    | Single-region Postgres: we choose consistency. If the DB is unreachable, writes fail clearly while cached public pages keep serving. |
| 35  | Eventual consistency | DOC        | this file                               | 🟡    | View/download counters lag up to one rollup interval; public pages update within seconds of publishing (tag revalidation), worst case at the next revalidation window. Measured in M8. |
| 36  | Optimistic locking   | BUILD      | `version` columns + `bump_version()`    | 🟡 M1 | DB side done: every real edit bumps `version`; system columns (search index, counters) don't. "Someone else edited this" UI in M5. |
| 37  | Pessimistic locking  | BUILD      | job claim RPC                           | ⏳ M8 | `SELECT … FOR UPDATE SKIP LOCKED`. |
| 38  | Distributed locks    | BUILD      | advisory locks                          | 🟡 M1 | Used today for the last-Super-Admin check; cron and issue publishing in M5/M8. |
| 39  | Race conditions      | BUILD      | constraints, triggers                   | ✅ M1 | Unique slug, unique (volume, issue), unique volume number; last-Super-Admin check serialised with an advisory lock inside the transaction; atomic upsert rate limiter; counters updated in SQL, never read-modify-write in JS. |
| 40  | Deadlocks            | BUILD      | data layer                              | ⏳ M5 | Short transactions, consistent lock order (volume → issue → article), retry on `40P01`. |

## Runtime health

| #   | Item               | Status | Where        | State | Notes |
| --- | ------------------ | ------ | ------------ | ----- | ----- |
| 41  | Memory leaks       | BUILD  | download/upload paths | 🟡 M1 | No module-level mutable state (cached data lives in Next's cache, not globals). Files never pass through functions: uploads use signed upload URLs, downloads redirect to signed URLs. |
| 42  | Garbage collection | DOC    | this file    | ✅    | Covered by 41: no large in-memory objects in request paths. |
| 43  | Thread safety      | DOC    | this file    | ✅    | Each function instance is single-threaded, but many run concurrently; all shared state is in Postgres. |
| 44  | Backpressure       | BUILD  | bulk upload, queue | ⏳ M5/M8 | Max 3 parallel uploads with a visible queue; workers claim bounded batches. |

## Scaling and delivery

| #   | Item               | Status   | Where        | State | Notes |
| --- | ------------------ | -------- | ------------ | ----- | ----- |
| 45  | Autoscaling        | PLATFORM | Vercel       | ✅    | |
| 46  | Horizontal scaling | PLATFORM | Vercel       | ✅    | App is stateless (sessions in cookies, state in Postgres). |
| 47  | Vertical scaling   | PLATFORM | Supabase     | ✅    | Dashboard → Project Settings → Compute and Disk; upgrade the compute add-on (minutes of downtime). |
| 48  | CDN                | PLATFORM | Vercel, Supabase Storage CDN | ✅ | |
| 49  | Edge caching       | BUILD    | route config, headers | 🟡 M1 | Static pages get `s-maxage` + `stale-while-revalidate` from Next (verified: home `s-maxage=86400`). Files/images headers in M7. |
| 50  | Cache invalidation | BUILD    | `lib/data/tags.ts` | ⏳ M5 | Every mutation calls `revalidateTag` for each affected tag (home, archive, issue, article, category, sitemap, RSS). |

## Releases

| #   | Item                 | Status   | Where                         | State | Notes |
| --- | -------------------- | -------- | ----------------------------- | ----- | ----- |
| 51  | Feature flags        | BUILD    | `feature_flags` table         | 🟡 M1 | Seeded: `submissions_open` (also enforced in RLS), `reviewer_module`, `home_most_read`, `google_sign_in`. Toggle UI in M8. |
| 52  | Blue-green           | PLATFORM | Vercel                        | ✅    | Every deployment is immutable; promotion to production is an atomic alias switch. |
| 53  | Canary releases      | DOC      | Vercel                        | ✅    | Staff test on preview URLs. Vercel Rolling Releases (Pro plan) if available; otherwise NOT NEEDED at this traffic. |
| 54  | Rolling deployments  | PLATFORM | Vercel                        | ✅    | |
| 55  | Rollbacks            | BUILD    | Vercel, `supabase/rollbacks/`, file versions | 🟡 M1 | App: instant rollback in Vercel. DB: each migration has a `.down.sql`; CI applies all reversals then re-applies migrations. Files: previous versions kept in `stored_files` (UI in M5). |
| 56  | Health checks        | BUILD    | `/api/health`                 | ✅ M1 | Checks DB and Storage with 3s timeouts; 200 or 503 with per-check latency. |
| 57  | Liveness / readiness | BUILD    | `/api/health/live`, `/api/health/ready` | ✅ M1 | Used by the Docker `HEALTHCHECK` and uptime monitors. |

## Observability

| #   | Item          | Status | Where                                | State | Notes |
| --- | ------------- | ------ | ------------------------------------ | ----- | ----- |
| 58  | Monitoring    | BUILD  | `app/layout.tsx`                     | 🟡 M1 | Vercel Analytics + Speed Insights installed. External uptime monitor setup documented in M8. |
| 59  | Logging       | BUILD  | `lib/server/logger.ts`               | ✅ M1 | pino JSON; request id on every API log line; redaction of passwords, tokens, cookies, emails; file contents never logged. |
| 60  | Tracing       | BUILD  | `instrumentation.ts`                 | ✅ M1 | Sentry when `SENTRY_DSN` is set, otherwise `@vercel/otel`. Sentry source-map upload can be added with a `SENTRY_AUTH_TOKEN` later. |
| 61  | Metrics       | BUILD  | —                                    | ⏳ M7/M8 | |
| 62  | Alerts        | BUILD  | —                                    | ⏳ M8 | |
| 63  | SLOs          | DOC    | below                                | ✅    | 99.5% monthly availability; p95 public page load < 2.5s; p95 download start < 1s. |
| 64  | SLIs          | DOC    | —                                    | ⏳ M8 | |
| 65  | Error budgets | DOC    | —                                    | ⏳ M8 | 99.5% ≈ 3h 39m of downtime per month. |
| 66  | Observability summary | DOC | —                                 | ⏳ M8 | |

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
| 74  | WAF                   | PLATFORM | Vercel Firewall                          | ⏳ M9 | |
| 75  | DDoS protection       | PLATFORM | Vercel                                   | ✅    | Plus rate limiting (item 1). |
| 76  | CORS                  | BUILD    | `lib/server/api.ts`                      | ✅ M1 | No CORS headers by default (same-origin only); `publicCors` only for `/api/v1/*`. |
| 77  | CSRF                  | BUILD    | `lib/server/api.ts`                      | ✅ M1 | Mutating route handlers reject foreign `Origin`; Server Actions have Next's built-in origin check; Supabase cookies are `SameSite=Lax`. |
| 78  | SQL injection         | BUILD    | all data access                          | ✅ M1 | Only the parameterised Supabase client and RPCs. Every SECURITY DEFINER function has `set search_path = ''`. |
| 79  | XSS                   | BUILD    | `lib/security/headers.ts`                | 🟡 M1 | Strict CSP (`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`). Inline scripts are allowed because nonces would make every page dynamic; sanitize-html on save and render arrives with the rich text editor (M3/M5). |
| 80  | SSRF                  | BUILD    | —                                        | ✅    | The server makes no requests to user-supplied URLs. Allow-list helper added if ORCID lookup is built. |
| 81  | Database migrations   | BUILD    | `supabase/migrations`, `migrate.yml`     | ✅ M1 | |
| 82  | Schema versioning     | BUILD    | `schema_version()` RPC                   | 🟡 M1 | Shown in Admin → Settings in M5. |

### Secret rotation

| Secret | Where to rotate | Then |
| ------ | --------------- | ---- |
| `SUPABASE_SERVICE_ROLE_KEY`, anon key | Supabase → Project Settings → API Keys (create new key, revoke old) | Update in Vercel (Production + Preview), redeploy |
| JWT signing key | Supabase → Project Settings → JWT Keys → Rotate | Users stay signed in (old key remains valid until expiry) |
| `METRICS_SALT` | `openssl rand -hex 24` | Update in Vercel; existing rate-limit windows reset (harmless) |
| `CRON_SECRET` | `openssl rand -hex 24` | Update in Vercel; redeploy |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Resend dashboard | Update in Vercel |
| `SENTRY_DSN` | Sentry → Project → Client Keys | Update in Vercel |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | Supabase account tokens / Database settings | Update GitHub repository secrets |

## Resilience and recovery

| #   | Item                   | Status   | Where             | State | Notes |
| --- | ---------------------- | -------- | ----------------- | ----- | ----- |
| 83  | Disaster recovery      | BUILD    | `docs/RUNBOOK.md` | ⏳ M8 | RPO 24h, RTO 4h. |
| 84  | Backups                | PLATFORM + BUILD | Supabase; weekly export to Google Drive | ⏳ M8 | |
| 85  | Failover               | DOC      | —                 | ⏳ M8 | |
| 86  | Multi-region           | NOT NEEDED | —               | ✅    | Readers are global but pages come from the CDN; one region for data is simpler and consistent. Adopt only if an SLO above 99.9% is required. |
| 87  | Chaos engineering      | NOT NEEDED (+ tests) | tests | ⏳ M8 | Tests simulate email and storage failures. |
| 88  | Cost optimisation      | BUILD    | —                 | ⏳ M8 | |

## Performance

| #   | Item               | Status | Where | State | Notes |
| --- | ------------------ | ------ | ----- | ----- | ----- |
| 89  | Cold starts        | BUILD  | `instrumentation-client.ts` | 🟡 M1 | Sentry loads only when configured; heavy libraries kept out of public pages. Next 16 `proxy.ts` always runs on Node (edge runtime is not supported there); health routes are tiny. |
| 90  | Serverless limits  | BUILD  | upload flows | ⏳ M5/M6 | All uploads go browser → Supabase Storage via signed upload URLs (TUS for large files). |
| 91–94 | Latency, throughput, p99, tail latency | DOC | — | ⏳ M9 | Measured against the production deployment. |
| 95  | Network partitions | DOC    | `lib/data/site-settings.ts` | 🟡 M1 | Public data loaders fall back or serve the cached page if Supabase is unreachable; admin shows "service unavailable" (M5). |
| 96  | Clock skew         | BUILD  | migrations | ✅ M1 | All timestamps default to `now()` in Postgres; triggers set `updated_at`. |
| 97  | DNS                | DOC    | README | 🟡 M1 | Web record documented. SPF/DKIM/DMARC once the sending domain is bought (M6). |
| 98  | TCP vs UDP         | NOT NEEDED | — | ✅ | Platform level; HTTP/3 (QUIC over UDP) is negotiated by Vercel automatically. |
| 99  | HTTP/2 and HTTP/3  | PLATFORM | Vercel | ✅ | |
| 100 | gRPC               | NOT NEEDED | — | ✅ | No internal services. |
| 101 | Webhooks           | BUILD  | — | ⏳ M6/M8 | Resend bounce/complaint webhooks, signed and idempotent. |

## APIs, infrastructure and operations

| #   | Item                   | Status     | Where                          | State | Notes |
| --- | ---------------------- | ---------- | ------------------------------ | ----- | ----- |
| 102 | API versioning         | BUILD      | `/api/v1/*`                    | ⏳ M7 | |
| 103 | Semantic versioning    | BUILD      | `CHANGELOG.md`, git tags       | ✅ M1 | |
| 104 | Infrastructure as code | BUILD      | `supabase/config.toml`, migrations, workflows | 🟡 M1 | `vercel.json` with crons added in M8. |
| 105 | Terraform              | NOT NEEDED | —                              | ✅    | Item 104 recreates everything from git. Consider Terraform's Vercel/Supabase providers only if managing several environments. |
| 106 | Helm charts            | NOT NEEDED | —                              | ✅    | No Kubernetes. |
| 107 | Build caching          | BUILD      | `ci.yml` (npm + `.next/cache`), Docker BuildKit cache | ✅ M1 | Vercel's build cache is on by default. |
| 108 | Dependency hell        | BUILD      | `package-lock.json`, `dependabot.yml`, `npm audit` in CI | ✅ M1 | Majors pinned; Dependabot ignores major bumps. |
| 109 | Production incidents   | BUILD      | `docs/RUNBOOK.md`              | ⏳ M8 | |
| 110 | On-call                | DOC        | `docs/RUNBOOK.md`              | ⏳ M8 | Alerts go to `ALERT_EMAIL` (the Super Admin). |
| 111 | Postmortems            | BUILD      | `docs/POSTMORTEM_TEMPLATE.md`  | ⏳ M8 | |

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
| Extra operational tables: `domain_events`, `jobs`, `dead_letter_jobs`, `feature_flags`, `rate_limits` | Items 1, 15, 17, 20, 51. |
| Reviewers have no direct access to `submissions` | Blinding is enforced by the database, not the UI: reviewers will read a blinded projection (M6). |

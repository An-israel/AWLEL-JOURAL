# AWLEL — African, World Literature and English Language

Website and editorial system for _AWLEL: University of Nigeria Journal of Language and Literary Studies_
(ISSN 2315-5493), published by the Department of English and Literary Studies, University of Nigeria, Nsukka.

- **Public site:** issue archive, article pages with citations and downloads, subject categories, search,
  and the journal's static pages.
- **Admin dashboard** (`/admin`): volumes, issues, articles, files, categories, submissions and peer
  review, editorial board, pages, users and settings.

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| App           | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict)  |
| Data and auth | Supabase: Postgres + Row Level Security, Auth, Storage, Realtime           |
| Styling       | Tailwind CSS 4 with AWLEL tokens; Poppins + Source Serif 4 via `next/font` |
| Hosting       | Vercel (app), Supabase (database and files)                                |
| Observability | pino JSON logs, OpenTelemetry / Sentry, Vercel Analytics, `/api/health`    |

Engineering decisions for every production concern are in [`docs/ENGINEERING.md`](docs/ENGINEERING.md).

---

## Local setup

Requirements: Node.js 22, Docker (for the local Supabase stack).

```bash
npm install
npm run db:start            # starts Supabase locally, applies migrations + seed
npx supabase status         # prints the local URL and keys
cp .env.example .env.local  # then fill in the values below
npm run seed:admin          # creates the first Super Admin
npm run dev                 # http://localhost:3000
```

For `.env.local`, take `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from `npx supabase status`, and
generate `METRICS_SALT` and `CRON_SECRET` with `openssl rand -hex 24`.

Useful commands:

| Command                      | What it does                                                      |
| ---------------------------- | ----------------------------------------------------------------- |
| `npm run db:reset`           | Re-create the local database from migrations and `seed.sql`       |
| `npm run db:types`           | Regenerate `lib/supabase/database.types.ts` after a schema change |
| `npm run test`               | Unit tests (Vitest)                                               |
| `npm run test:db`            | Database tests: RLS, triggers, integrity (pgTAP)                  |
| `npm run test:e2e`           | End-to-end tests (Playwright) against a production build          |
| `npm run db:check-rollbacks` | Prove every migration's reversal works                            |
| `npm run lint` / `typecheck` | ESLint / TypeScript                                               |

The seed adds the categories, the editorial board (flagged _to be verified_), placeholder static pages,
and **one fictional sample issue with three sample articles** for previewing the design. Delete the
sample issue (Volume 26) from the admin before launch.

## Supabase setup (production)

1. In the Supabase dashboard, note the **project ref**, **API URL**, **anon key**, **service role key**
   and **database password**.
2. Apply the schema from your machine:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # migrations: tables, RLS policies, storage buckets and policies
   ```

   After the first push, merges to `main` apply new migrations automatically
   (`.github/workflows/migrate.yml`, which needs the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and
   `SUPABASE_DB_PASSWORD` repository secrets).

3. Seed reference data once: run the contents of `supabase/seed.sql` in the SQL editor. It is idempotent.
   Skip the "SAMPLE CONTENT" section if you don't want the sample issue in production.
4. **Auth → URL configuration:** set _Site URL_ to `https://awlel.unn.edu.ng` and add
   `https://awlel.unn.edu.ng/auth/callback` and `https://*.vercel.app/auth/callback` to the redirect URLs.
5. **Auth → Providers:** keep _Email_ enabled. Optionally enable _Google_ (item 69 in the engineering doc).
6. **Auth → SMTP:** use Resend's SMTP credentials so sign-up and password emails come from the journal's
   domain.
7. Storage buckets (`issue-covers`, `site-assets`, `published-files`, `submissions`) and their policies are
   created by the migrations; there is nothing to click.

## Environment variables

All variables are documented in [`.env.example`](.env.example). Set them in **Vercel → Project → Settings →
Environment Variables** for Production and Preview. Only `NEXT_PUBLIC_*` values reach the browser;
`SUPABASE_SERVICE_ROLE_KEY` must never be given a `NEXT_PUBLIC_` prefix. Rotation steps for every secret
are in `docs/ENGINEERING.md` (item 67).

## Creating the first Super Admin

Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (12+ characters) and `SUPER_ADMIN_NAME` together with
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (pointing at production), then:

```bash
npm run seed:admin
```

Remove the password from the file afterwards and sign in at `/login`. Every other staff account (Editor,
Reviewer, Super Admin) is created by invitation from **Admin → Users and Roles**. The database refuses to
demote or deactivate the last active Super Admin.

## Deploying to Vercel

1. Import the GitHub repository in Vercel (framework: Next.js; defaults are correct).
2. Add the environment variables above.
3. Choose a Function Region close to the Supabase region (Project → Settings → Functions).
4. Every pull request gets a preview deployment; merging to `main` deploys production. Roll back
   instantly from **Deployments → ⋯ → Promote to Production** on an earlier deployment.

## Pointing awlel.unn.edu.ng at Vercel

In Vercel, **Project → Settings → Domains → Add** `awlel.unn.edu.ng`. Then ask UNN ICT to create:

| Type  | Name                    | Value                                          |
| ----- | ----------------------- | ---------------------------------------------- |
| CNAME | `awlel` (in unn.edu.ng) | `cname.vercel-dns.com.` (use the value Vercel shows) |

Vercel issues the TLS certificate automatically once the record resolves. Email DNS (SPF, DKIM, DMARC) for
the sending domain is covered in `docs/ENGINEERING.md` (item 97).

## Editor's guide: publishing an issue

_The admin screens arrive in milestone 5; this guide will be completed then._

1. **Volumes and Issues → New volume:** enter the volume number and the year.
2. **Add issue:** issue number, optional month and legacy number, cover image, editorial.
3. **Bulk upload:** drop all article PDFs and Word files; match each file to its article row.
4. Check the preview, then **Publish**. The home page, archive, sitemap and RSS update automatically.

## Self-hosting

See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for running the Docker image on university servers.

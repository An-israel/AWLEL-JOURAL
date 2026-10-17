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
| Operations    | Postgres job queue; Vercel Cron (daily) + GitHub Actions (every 30 min, weekly backup) |

Engineering decisions for every production concern are in [`docs/ENGINEERING.md`](docs/ENGINEERING.md).
What to do when something breaks, how to restore from a backup, and the one-time operational setup
(scheduled tasks, backups to Google Drive, uptime monitor, email webhooks) are in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md). A public read-only JSON API is at `/api/v1`.

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

   After the first push, new migrations are applied automatically, either by the Supabase GitHub
   integration (set its production branch to the branch Vercel deploys) or by
   `.github/workflows/migrate.yml` on pushes to `main` (needs the `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` repository secrets). Use one of the two, not both. If
   your production branch isn't `main`, change the branch name in `migrate.yml` and `ci.yml`.

3. Seed reference data once: run the contents of `supabase/seed.sql` in the SQL editor. It is idempotent.
   Skip the "SAMPLE CONTENT" section if you don't want the sample issue in production.
4. **Auth → URL configuration:** set _Site URL_ to `https://awlel.unn.edu.ng` and add
   `https://awlel.unn.edu.ng/auth/callback` and `https://*.vercel.app/auth/callback` to the redirect URLs.
5. **Auth → Providers:** keep _Email_ enabled with **Confirm email** switched on (local development has it off).
   Optionally enable _Google_, then turn on the `google_sign_in` feature flag.
   **Auth → Email templates:** keep the default links; they all return through `/auth/callback`.
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
2. Connect Supabase through the **Supabase for Vercel** integration, or add the variables from
   `.env.example` by hand. The app accepts the integration's names (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`) as well as the ones in `.env.example`.
3. Also add `METRICS_SALT` and `CRON_SECRET` (`openssl rand -hex 24`), `NEXT_PUBLIC_SITE_URL`, and the email
   settings once your sending domain is ready.
4. Choose a Function Region close to the Supabase region (Project → Settings → Functions).
5. **Set up the database before the site has content** (see "Supabase setup" above: `supabase db push`, then
   run `supabase/seed.sql` once in the SQL editor). Until then the site deploys and shows empty pages; they
   fill in within a few minutes of the schema appearing, or straight away on the next deploy.
6. Every pull request gets a preview deployment; merging to the production branch deploys production. Roll
   back instantly from **Deployments → ⋯ → Promote to Production** on an earlier deployment.
7. Finish the operational setup in [`docs/RUNBOOK.md`](docs/RUNBOOK.md), “One-time setup”: `ALERT_EMAIL`,
   the GitHub secrets for the 30-minute queue worker and the weekly backup, the uptime monitor and the
   Resend webhook. `vercel.json` registers the daily cron automatically.

If the Supabase GitHub integration is connected, set its **production branch** to the same branch Vercel
deploys to production, with the Supabase directory `supabase`. Supabase then applies new migrations on every
push to that branch (it does not run `seed.sql` on production; do that once by hand).

## Pointing awlel.unn.edu.ng at Vercel

1. In Vercel, **Project → Settings → Domains → Add** `awlel.unn.edu.ng`. Vercel shows the record it expects.
2. Send UNN ICT [`docs/DNS_FOR_UNN_ICT.md`](docs/DNS_FOR_UNN_ICT.md), with the value from step 1 filled in.
   In short:

   | Type  | Name                    | Value                                                |
   | ----- | ----------------------- | ---------------------------------------------------- |
   | CNAME | `awlel` (in unn.edu.ng) | `cname.vercel-dns.com.` (use the value Vercel shows) |

3. Once the record resolves, Vercel issues and renews the HTTPS certificate by itself. Then set
   `NEXT_PUBLIC_SITE_URL=https://awlel.unn.edu.ng`, update Supabase → Auth → URL configuration (above) and
   the `SITE_URL` GitHub secret, and redeploy.

**Email.** For emails from the site to reach inboxes, the sending domain needs SPF, DKIM and DMARC records.
Add the domain in Resend (Domains → Add) and create the records it lists: at your registrar if the journal
bought its own domain, or through UNN ICT if sending from `awlel.unn.edu.ng` (section 2 of the DNS sheet).
Then set `EMAIL_FROM` (for example `AWLEL Journal <no-reply@your-domain>`) and `RESEND_API_KEY` in Vercel.

## Editor's guide: publishing an issue

1. **Admin → Volumes and Issues → New volume.** Enter the volume number and the year (they are entered
   separately because older years don't always follow the pattern).
2. **Add issue** on that volume: issue number, and optionally the month and a legacy running number (for
   example "19" for "Number 19 (November 2019)"). The issue opens as a draft.
3. On the issue page, fill in any title or editorial and upload the **cover**, **full-issue PDF** and
   **full-issue Word** files.
4. **Bulk upload** the articles:
   - Import a CSV with the columns `title, authors, affiliations, category, first_page, last_page, keywords,
     abstract, citation_style, pdf_filename, docx_filename` (separate several authors with semicolons), or
     add rows by hand.
   - Drop all the PDF and Word files. Each is matched to its article by file name; choose the article for
     any marked "Not matched".
   - Press **Start**. Articles are created as drafts and files upload three at a time.
5. Check each article (Admin → Articles), set the order of the contents by dragging on the issue page, and
   use **Preview** to see the issue as readers will.
6. Press **Publish issue** and tick "Also publish its draft articles". The archive, home page, category
   pages and search update immediately.

Replacing a file keeps the old one: open **Versions** next to any file to see or restore earlier uploads.
If you see "Someone else edited this", another editor saved the same item while you were working; reload
and make your change again.

## Self-hosting

See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for running the Docker image on university servers.

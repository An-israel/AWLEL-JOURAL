# AWLEL runbook

What to do when something goes wrong, how to set up the operational parts once, and how to restore the site
from a backup. Written for the Super Admin and whoever helps them; no prior knowledge of the code is assumed.

- **Admin → Operations** shows what is healthy and what is not. Start there.
- **Vercel → Project → Logs** shows every request and error. Error pages show a *reference* and API errors
  return a `requestId`; paste either into the Logs search to find the matching line.
- Engineering background: `docs/ENGINEERING.md`. After any incident, fill in `docs/POSTMORTEM_TEMPLATE.md`.

## Contacts and on-call

Alerts go to the address in `ALERT_EMAIL` (the Super Admin) and from the uptime monitor. There is no paid
on-call rota: the Super Admin checks alerts within a working day, sooner during submission deadlines and
issue launches.

| Role | Who | When to contact |
| ---- | --- | --------------- |
| First responder | Super Admin (`ALERT_EMAIL`) | Every alert |
| Technical escalation | The department's web contact or developer (fill in) | Anything in this runbook you can't resolve in an hour |
| Domain registrar | The company the domain was bought from (fill in) | Certificate or domain problems |
| Platforms | Vercel support, Supabase support (dashboard → Support) | Platform outages lasting over an hour |

Status pages: [vercel-status.com](https://www.vercel-status.com), [status.supabase.com](https://status.supabase.com),
[resend-status.com](https://resend-status.com), [githubstatus.com](https://www.githubstatus.com).

## Handling any incident

1. **Detect.** An alert email, the uptime monitor, or a report from a reader or editor.
2. **Triage (10 minutes).** Open Admin → Operations (if it loads) and the status pages above. Decide how bad
   it is: *site down* (nobody can read) → act now; *a feature broken* (downloads, submissions, emails) → act
   today; *degraded* (slow, one failed email) → act this week.
3. **Communicate.** For anything readers or authors notice for more than 30 minutes, post a short notice
   at the top of the Contact page (Admin → Pages → Contact) and reply to affected authors. Say what is affected
   and when you will update next, not guesses about the cause.
4. **Fix** using the matching section below. Prefer undoing the last change (Vercel “Instant Rollback”) over
   fixing forward under pressure.
5. **Close.** Check Admin → Operations is all green, tell the people you notified, and write a postmortem
   within a week for anything that lasted over an hour or lost data.

## Alerts and what they mean

Each alert email says what is wrong; this table says where to go.

| Alert | Go to |
| ----- | ----- |
| Site dependency failing (database / storage) | [Site down or erroring](#site-down-or-erroring) |
| N server errors in the last hour | [Site down or erroring](#site-down-or-erroring) |
| Background jobs have failed for good | [Emails not arriving](#emails-not-arriving) |
| Jobs waiting longer than an hour | [Emails not arriving](#emails-not-arriving) |
| Provider unavailable: resend | [Emails not arriving](#emails-not-arriving) |
| Queue worker / daily maintenance has not run | [Scheduled tasks not running](#scheduled-tasks-not-running) |
| No successful backup for over a week / no backup recorded yet | [Backups](#backups-failing) |
| HTTPS certificate expires in N days | [Certificate](#certificate-expiring) |
| Uptime monitor: site down | [Site down or erroring](#site-down-or-erroring) |

## Site down or erroring

1. Open the site and `/api/health` in a private window. `/api/health` lists which dependency fails.
2. Check the status pages. If Vercel or Supabase report an incident, there is nothing to fix: cached pages
   keep serving; post a notice if it lasts.
3. If it started right after a deployment: Vercel → Deployments → previous deployment → **Instant
   Rollback**. This takes seconds and is safe. Then find the cause at leisure.
4. If the database fails and Supabase reports no incident: Supabase dashboard → Project. A **paused** project
   (free plan, after a week without visits) shows a *Restore project* button; press it (takes a few
   minutes). Repeated pauses mean the project should move to the Pro plan.
5. If errors persist: Vercel → Logs, filter by level *error*. The message and request id point to the code
   path. Escalate with the request id and the time.

## Uploads failing

Symptoms: editors see “The upload didn't finish” or the progress bar stops.

1. Try a small file. If small files work, the file may exceed the limit (50 MB for published files, 20 MB for
   manuscripts) or have the wrong type (PDF or Word `.docx` only; covers are images). 50 MB is the most
   Supabase's Free plan accepts for one file: compress a larger PDF (for example with "Reduce file size" in
   your PDF program) or split a full issue. Supabase Pro allows larger files; raising the site's limit then is
   a small change for a developer (`lib/admin/file-slots.ts` and the `published-files` bucket).
2. Check Supabase status and Admin → Operations → Storage latency.
3. Check the browser's network tab for the upload request to `…supabase.co/storage/…`: a 4xx means the signed
   link expired (retry the upload), a 5xx means Storage itself is failing (wait, then retry).
4. Half-finished uploads are cleaned up automatically by the daily cleanup; nothing needs tidying by hand.

## Emails not arriving

1. Admin → Operations → **Email delivery**. If the provider shows “Paused”, Resend is failing; emails are
   queued and will go out by themselves when it recovers. Check resend-status.com.
2. **Failed jobs**: open each one and read the error.
   - `Resend responded 401/403`: the API key is wrong or revoked → create a new key in Resend, update
     `RESEND_API_KEY` in Vercel, redeploy, then **Retry** each failed job.
   - `Resend responded 422`: usually the sending domain isn't verified or `EMAIL_FROM` uses another domain →
     fix in Resend → Domains, then Retry.
   - `No handler for job type …`: a code problem → escalate.
3. **Configuration** must show `RESEND_API_KEY` as *Set*. Without it, emails are only written to the log.
4. One person not receiving mail: check **Email delivery** for their address under suppressed addresses (it
   bounced or they marked us as spam). If they confirm the address works, press **Allow again**. Also ask
   them to check spam; if mail goes to spam often, check that the SPF, DKIM and DMARC records Resend lists
   under Domains are all verified.
5. Jobs waiting a long time with nothing failing means the worker isn't running → next section.

## Scheduled tasks not running

Admin → Operations → **Scheduled tasks** shows the last run of each.

- **Daily maintenance** runs from Vercel Cron (`vercel.json`). Vercel → Project → Settings → Cron Jobs must
  list `/api/cron/daily`. `CRON_SECRET` must be set in Vercel; a mismatch shows as 401 in the cron's logs.
- **Queue worker (scheduled)** runs from GitHub → Actions → “Scheduled tasks” every 30 minutes. It needs the
  repository secrets `SITE_URL` and `CRON_SECRET` (the same value as in Vercel). If the run log says
  “skipping”, a secret is missing. GitHub pauses scheduled workflows in public repositories after 60 days
  without commits: re-enable it from the Actions tab.
- Any task can be run by hand with **Run now** while you fix the schedule.

## Wrong file published

1. Open the article (or issue) in the admin, find the file, and press **Versions**. Every earlier upload is
   kept: **Restore** the right one, or **Upload** the corrected file. The public page and download update at
   once.
2. If a file must disappear immediately (e.g. an unredacted manuscript), **Remove** it from the article; it
   stops being downloadable at once. Download links already handed out expire within one minute.
3. If the whole article should not be public, **Unpublish** it.
4. The Audit Log records who replaced or removed which file, and when.
5. Google Scholar may keep an old copy for a while; it refreshes on its next crawl.

## Certificate expiring

Vercel renews HTTPS certificates automatically about 30 days before expiry. An alert means renewal is
failing, nearly always because the DNS record no longer points at Vercel.

1. Vercel → Project → Settings → Domains: the domain should show a valid configuration. If it shows an error,
   it names the DNS record it expects.
2. At the domain registrar, restore the records exactly as `docs/DOMAIN_SETUP.md` and Vercel list them.
   Once DNS is right, Vercel issues the certificate within minutes.

## Backups failing

GitHub → Actions → **Backup** shows each weekly run and its log.

- `SUPABASE_DB_URL is not set`, or a connection error: check the repository secret (Supabase → Connect →
  Session pooler string, with the password filled in).
- Google sign-in failed (`invalid_grant`): the refresh token expired or was revoked. Create a new one
  ([Set up backups](#set-up-backups), steps 4–5) and update `GOOGLE_REFRESH_TOKEN`.
- After fixing, press **Run workflow** to run it now (tick “Also back up stored files” to include files).
- Even when the Drive copy fails, the run keeps its archive as a downloadable artifact for 30 days.

## Restore from a backup

Disaster recovery (RPO 24 hours, RTO 4 hours). Use this when the Supabase project is lost or its data is
damaged beyond what Supabase's own backups can fix.

**First choice, Supabase Pro:** Supabase dashboard → Database → Backups → choose a day → Restore. This
restores the database (not Storage files) in place. If that works, stop here.

**Otherwise, from the weekly backup** (about 1–2 hours of work):

1. **Get the backup** (10 min): from the Drive folder “AWLEL backups”, or GitHub → Actions → Backup → the
   run → Artifacts. You need the newest `awlel-db-YYYY-MM-DD.tar.gz` and, for files, the newest
   `awlel-files-YYYY-MM-DD.tar.gz`. Unpack `meta.json` from the database archive to see its commit.
2. **New Supabase project** (15 min), if the old one is gone: create it in the same region, then in the
   repository: `git checkout <commit from meta.json>`, then
   `npx supabase link --project-ref <new-ref>` and `npx supabase db push`. This builds the schema, policies
   and storage buckets exactly as they were.
3. **Load the data** (10 min): `scripts/restore-backup.sh awlel-db-YYYY-MM-DD.tar.gz "<new database URL>"`
   (Session pooler URL with password). It asks you to type RESTORE, empties the new database's tables, loads
   the backup and prints row counts. Users keep their passwords.
4. **Load the files** (depends on size): unpack the files archive to a folder, then
   `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restore-files.mjs <folder>`.
   Files uploaded after the last monthly archive are missing; `manifest.json` in the weekly database archive
   lists them, so you can ask editors to re-upload those.
5. **Point the site at it** (15 min): in Vercel, update `NEXT_PUBLIC_SUPABASE_URL`, the anon/publishable key
   and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Update the GitHub secrets that name the project.
6. **Check** (15 min): sign in as Super Admin; open an issue, an article and a download; Admin → Operations
   all green; `/api/health` returns 200.
7. Tell editors which day the data is from; anything after that (new submissions, edits) must be redone.

**Restore drill.** Repeat steps 2–6 against a scratch Supabase project once a year and after any change to the
backup workflow, and note the date and result here. The first drill (2026-10-17, local stack) restored every
row (users, issues, articles, files, audit log, metrics), all database tests passed and sign-in worked. It also
showed why step 2 uses the migrations: the dump's own schema file leaves out the trigger that creates user
profiles and the storage policies.

## Rolling back a bad change

- **App:** Vercel → Deployments → the last good one → **Instant Rollback**.
- **Database migration:** every migration has a reversal in `supabase/rollbacks/`. Run it in the Supabase SQL
  editor only if the migration itself is the problem, then revert the commit so it isn't re-applied. Data
  written in the meantime is kept unless the reversal drops a table (each file says so).
- **Content:** every replaced file has a Versions list; unpublishing hides an issue or article at once; the
  trash restores deleted items.

## One-time setup

Do these once after the first production deployment (README covers Vercel and Supabase themselves).

### Scheduled tasks and alerts

1. Vercel → Settings → Environment Variables: set `CRON_SECRET` (`openssl rand -hex 24`) and `ALERT_EMAIL`.
   Redeploy. Vercel → Settings → Cron Jobs now lists `/api/cron/daily`.
2. GitHub → repository → Settings → Secrets and variables → Actions: add `SITE_URL`
   (`https://awlel.unn.edu.ng`) and `CRON_SECRET` (same value). Actions → “Scheduled tasks” → **Run workflow**
   once and check it passes.
3. Admin → Operations → **Run alert check now**. The “No backup has been recorded yet” alert is expected
   until backups are set up, and its email proves alert emails arrive.

### Set up backups

1. Repository secrets for the database: `SUPABASE_DB_URL` (Supabase → Connect → Session pooler, with the
   password), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. In [Google Cloud console](https://console.cloud.google.com), signed in as the journal's Google account:
   create a project “AWLEL backups”; APIs & Services → Library → enable **Google Drive API**.
3. APIs & Services → OAuth consent screen: External; app name “AWLEL backups”; your email; add the scope
   `.../auth/drive.file`; then **Publish app** (in “Testing” mode Google expires the token after 7 days).
   Credentials → Create credentials → OAuth client ID → **Web application**; authorised redirect URI:
   `https://developers.google.com/oauthplayground`. Copy the client ID and secret.
4. Open the [OAuth Playground](https://developers.google.com/oauthplayground), click the gear icon, tick
   “Use your own OAuth credentials” and paste them. In step 1 enter the scope
   `https://www.googleapis.com/auth/drive.file`, authorise with the journal's account (accept the “unverified
   app” warning: it is your own app), then **Exchange authorization code for tokens** and copy the refresh
   token.
5. Repository secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
6. Actions → Backup → **Run workflow** (tick “Also back up stored files”). A folder “AWLEL backups” appears
   in the Drive with both archives, and Admin → Operations shows the backup as *Succeeded*.

The `drive.file` scope lets the backup see only the folder it created, nothing else in the Drive.

### Uptime monitor

1. Create a free account at [uptimerobot.com](https://uptimerobot.com) with the Super Admin's email.
2. Add two HTTP(s) monitors, 5-minute interval: `https://awlel.unn.edu.ng/` and
   `https://awlel.unn.edu.ng/api/health` (alert when the status is not 200).
3. Alert contact: the Super Admin's email (and a second person if possible).
4. Optional: a public status page, linked from the Contact page.

### Firewall

1. Vercel → Project → Firewall: check **Bot Protection** is on (block known bad bots; search engines and
   Google Scholar stay allowed).
2. If the site is ever under attack (sudden traffic, the uptime monitor flapping), switch on **Attack
   Challenge Mode** there until it passes; visitors see a brief browser check.
3. The site's own rate limits keep working whatever the firewall setting.

### Email delivery webhooks

1. Resend → Webhooks → Add endpoint: `https://awlel.unn.edu.ng/api/webhooks/resend`, events
   `email.bounced` and `email.complained`.
2. Copy its signing secret (`whsec_…`) into Vercel as `RESEND_WEBHOOK_SECRET` and redeploy.
3. Admin → Operations → Configuration shows it as *Set*.

## Routine checks

- **Weekly (5 minutes):** Admin → Operations all green; the Backup run succeeded.
- **Before each issue launch:** open the issue preview, check every download, then publish; check the public
  issue page and one download afterwards.
- **Yearly:** restore drill; rotate `CRON_SECRET` and `METRICS_SALT` (`docs/ENGINEERING.md`, “Secret
  rotation”); check the contacts table above is current.

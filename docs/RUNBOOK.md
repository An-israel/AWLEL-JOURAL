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
   (free plan, after about a week without activity) shows a *Restore project* button; press it (takes a few
   minutes). The daily maintenance task and the uptime monitor normally keep the project awake, so a pause
   usually means both stopped: check [Scheduled tasks](#scheduled-tasks-not-running) and the monitor too.
   Restore promptly: after a long pause (Supabase currently says 90 days) the dashboard can no longer restore
   it. Repeated pauses mean the project should move to the Pro plan.
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
3. **Configuration** must show both `RESEND_API_KEY` and `EMAIL_FROM` as *Set*. Until both are, every email
   waits in the queue (“Waiting to retry”; nothing is lost and no attempts are used up) and the logs say
   “emails stay queued until both are set”. Once both are set and the site redeployed, the waiting emails go
   out on the next scheduled run (within about 30 minutes). Emails that waited more than two weeks are dropped
   instead, with a “job dropped” line in the logs, because they would arrive too late to be useful.
4. **Sign-up confirmations, password resets or invitations not arriving:** once `RESEND_API_KEY` and
   `EMAIL_FROM` are set, the site sends these itself, through the same queue as every other email, so the
   checks above apply. (Before that, Supabase sends them, to members of your Supabase team only.) If the email
   arrives but its link says it is invalid or expired, ask for a new one: each link works once and expires
   after an hour (Supabase → Authentication → Emails → *Email OTP Expiration*). Also check the Site URL under
   Authentication → URL Configuration is the site's exact address.
5. One person not receiving mail: check **Email delivery** for their address under suppressed addresses (it
   bounced or they marked us as spam). If they confirm the address works, press **Allow again**. Also ask
   them to check spam; if mail goes to spam often, check that the SPF, DKIM and DMARC records Resend lists
   under Domains are all verified.
6. Jobs waiting a long time with nothing failing, while both email settings are *Set*, means the worker isn't
   running → next section.

## Scheduled tasks not running

Admin → Operations → **Scheduled tasks** shows the last run of each.

- **Daily maintenance** runs from Vercel Cron (`vercel.json`). Vercel → Project → Settings → Cron Jobs must
  list `/api/cron/daily`. `CRON_SECRET` must be set in Vercel; a mismatch shows as 401 in the cron's logs.
- **Queue worker (scheduled)** runs from GitHub → Actions → “Scheduled tasks” every 30 minutes. It needs the
  repository secrets `SITE_URL` and `CRON_SECRET` (the same value as in Vercel). Open the latest run and
  read its log:
  - “skipping”: a secret is missing.
  - “SITE_URL redirects to …”: `SITE_URL` is an address that forwards elsewhere (often the domain without
    `www` forwarding to the one with it). Set the secret to the exact address the log names, without the `/` at
    the end (`docs/DOMAIN_SETUP.md`, part 1, step 5).
  - “The site answered HTTP 401”: `CRON_SECRET` differs between GitHub and Vercel.
- **GitHub switched the schedules off.** In a public repository GitHub disables scheduled workflows after 60
  days without any change to the repository, usually emailing a warning a few days before. The “Scheduled
  tasks” workflow re-enables itself and “Backup” once a day to prevent this, but if a workflow shows *This
  scheduled workflow is disabled*: GitHub → **Actions** → choose the workflow in the left-hand list → **Enable
  workflow**, then **Run workflow** once to check it passes. Do the same for **Backup**. (Private repositories
  aren't affected.)
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

- “Backups are not set up yet; skipping”: `SUPABASE_DB_URL` is not set, so nothing was backed up. Finish
  [Set up backups](#set-up-backups).
- “Missing repository secrets: …”, or a connection error: add or correct the secrets it names (for
  `SUPABASE_DB_URL`: Supabase → Connect → Session pooler string, with the password filled in).
- Google sign-in failed (`invalid_grant`): the refresh token expired or was revoked. Create a new one
  ([Set up backups](#set-up-backups), steps 4–5) and update `GOOGLE_REFRESH_TOKEN`.
- “SITE_URL redirects to …”: the backup itself worked (check the Drive folder), but the site wasn't told. Set
  the `SITE_URL` secret to the exact address the log names ([Scheduled tasks](#scheduled-tasks-not-running)).
- After fixing, press **Run workflow** to run it now (tick “Also back up stored files” to include files).
- Backups are kept only in the journal's Google Drive, never as downloadable files on GitHub: the database
  backup contains every account's (scrambled) password, and anyone can download a public repository's
  workflow files. When the Drive copy fails, the run fails and alerts; run it again once it is fixed.

## Restore from a backup

Disaster recovery (RPO 24 hours, RTO 4 hours). Use this when the Supabase project is lost or its data is
damaged beyond what Supabase's own backups can fix.

**First choice, Supabase Pro:** Supabase dashboard → Database → Backups → choose a day → Restore. This
restores the database (not Storage files) in place. If that works, stop here.

**Otherwise, from the weekly backup** (about 1–2 hours of work):

1. **Get the backup** (10 min): from the Drive folder “AWLEL backups”, download the newest
   `awlel-db-YYYY-MM-DD.tar.gz` and, for files, the newest `awlel-files-YYYY-MM-DD.tar.gz`. Open the database
   archive (Windows 11 File Explorer opens `.tar.gz` files; otherwise use 7-Zip) and open `meta.json` in
   Notepad: note the long `commit` code.
2. **New Supabase project** (15 min), if the old one is gone: create it in the same region. Then open
   `https://github.com/An-israel/AWLEL-JOURAL/blob/<commit>/supabase/setup/production-setup.sql` with `<commit>`
   replaced by the code from `meta.json`, copy it and run it in the new project's SQL Editor, exactly as in
   `docs/LAUNCH_GUIDE.md`, step 1. This builds the tables, security rules and storage buckets exactly as they
   were when the backup was made.
3. **Load the data** (10 min). *For a developer: this needs a computer with the command line, because the
   Supabase website can't load a database backup.* `scripts/restore-backup.sh awlel-db-YYYY-MM-DD.tar.gz
   "<new database URL>"` (Session pooler URL with password). It asks you to type RESTORE, empties the new
   database's tables, loads the backup and prints row counts. Users keep their passwords.
4. **Load the files** (depends on size). *For a developer, as step 3:* unpack the files archive to a folder,
   then `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restore-files.mjs <folder>`.
   Files uploaded after the last monthly archive are missing; `manifest.json` in the weekly database archive
   lists them, so you can ask editors to re-upload those.
5. **Point the site at it** (15 min): in Vercel, update `NEXT_PUBLIC_SUPABASE_URL`, the anon/publishable key
   and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Update the GitHub secrets that name the project
   (`SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Repeat `docs/LAUNCH_GUIDE.md` step 2 in the new
   project: it isn't part of the backup.
6. **Check** (15 min): sign in as Super Admin; open an issue, an article and a download; Admin → Operations
   all green; your site address followed by `/api/health` shows `"status":"ok"`.
7. Tell editors which day the data is from; anything after that (new submissions, edits) must be redone.

**Restore drill.** Repeat steps 2–6 against a scratch Supabase project once a year and after any change to the
backup workflow, and note the date and result here. The first drill (2026-10-17, local stack) restored every
row (users, issues, articles, files, audit log, metrics), all database tests passed and sign-in worked. It also
showed why step 2 rebuilds the schema from the migrations (which `production-setup.sql` contains): the dump's
own schema file leaves out the trigger that creates user profiles and the storage policies.

## Rolling back a bad change

- **App:** Vercel → Deployments → the last good one → **Instant Rollback**.
- **Database update:** every update has a reversal in `supabase/rollbacks/` (open it on GitHub, copy it, and
  run it in the Supabase SQL Editor). Do this only if the update itself is the problem, and ask the developer to
  withdraw the change, or `production-setup.sql` applies it again the next time it is run. Data written in the
  meantime is kept unless the reversal drops a table (each file says so).
- **Content:** every replaced file has a Versions list; unpublishing hides an issue or article at once; the
  trash restores deleted items.

## One-time setup

Do these once after the first production deployment (`docs/LAUNCH_GUIDE.md` covers Vercel and Supabase
themselves). Below, *your site address* means the site's exact address with no `/` at the end, as it stays in
the browser's address bar, e.g. `https://www.awlel-journal.org` (`docs/DOMAIN_SETUP.md`, part 1, step 5).

### Scheduled tasks and alerts

1. Vercel → Settings → Environment Variables: set `CRON_SECRET` (make up a long random text, 32 or more
   letters and numbers, and keep a copy for step 2) and `ALERT_EMAIL`. Redeploy. Vercel → Settings → Cron Jobs
   now lists `/api/cron/daily`.
2. GitHub → repository → Settings → Secrets and variables → Actions → **New repository secret**: add
   `SITE_URL` (your site address) and `CRON_SECRET` (the same text as in Vercel). Actions → “Scheduled tasks”
   → **Run workflow** once and check it passes (a green tick).
3. Admin → Operations → **Run alert check now**. Until backups are set up it reports “No backup has been
   recorded yet”; that is expected. Alerts are always written to Vercel → Logs (search for `ALERT`), but are
   **emailed only once email sending works** (`RESEND_API_KEY` and `EMAIL_FROM`, `docs/DOMAIN_SETUP.md`). To
   check alert emails arrive, press **Run alert check now** after email is set up and before the first backup:
   the “No backup” alert should reach `ALERT_EMAIL` within a minute (at most one email per alert a day).

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
7. **Make the repository private** if it isn't already: GitHub → the repository → **Settings** → **General** →
   **Danger Zone** → **Change visibility** → **Make private**. Backups never go to GitHub, but there is no need
   for the code and the details of how the site is run to be public. The scheduled tasks then use about 1,500
   of GitHub's 2,000 free Actions minutes a month.

The `drive.file` scope lets the backup see only the folder it created, nothing else in the Drive. Until step 1
is done, each weekly run just notes “Backups are not set up yet” and passes, so no failure emails arrive.

### Uptime monitor

1. Create a free account at [uptimerobot.com](https://uptimerobot.com) with the Super Admin's email.
2. Add two HTTP(s) monitors, 5-minute interval: your site address followed by `/` (e.g.
   `https://www.awlel-journal.org/`) and your site address followed by `/api/health` (alert when the status is
   not 200). Checking `/api/health` also keeps a free Supabase project from being paused.
3. Alert contact: the Super Admin's email (and a second person if possible).
4. Optional: a public status page, linked from the Contact page.

### Firewall

1. Vercel → Project → Firewall: check **Bot Protection** is on (block known bad bots; search engines and
   Google Scholar stay allowed).
2. If the site is ever under attack (sudden traffic, the uptime monitor flapping), switch on **Attack
   Challenge Mode** there until it passes; visitors see a brief browser check.
3. The site's own rate limits keep working whatever the firewall setting.

### Email delivery webhooks

1. Resend → Webhooks → Add endpoint: your site address followed by `/api/webhooks/resend` (e.g.
   `https://www.awlel-journal.org/api/webhooks/resend`), events `email.bounced` and `email.complained`.
2. Copy its signing secret (`whsec_…`) into Vercel as `RESEND_WEBHOOK_SECRET` and redeploy.
3. Admin → Operations → Configuration shows it as *Set*.

## Routine checks

- **Weekly (5 minutes):** Admin → Operations all green; the Backup run succeeded.
- **Before each issue launch:** open the issue preview, check every download, then publish; check the public
  issue page and one download afterwards.
- **Yearly:** restore drill; rotate `CRON_SECRET` and `METRICS_SALT` (`docs/ENGINEERING.md`, “Secret
  rotation”); check the contacts table above is current.

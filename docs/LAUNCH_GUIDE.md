# Getting the site live: step by step

No command line needed: everything is done in the Supabase and Vercel websites. Allow about 30 minutes.
Do the steps in order.

## Step 1: Set up the database (Supabase, once)

1. Open the file
   [`supabase/setup/production-setup.sql`](https://github.com/An-israel/AWLEL-JOURAL/blob/claude/sleepy-brown-4e80zc/supabase/setup/production-setup.sql)
   on GitHub (sign in to GitHub if asked). Click the **Copy raw file** button (two overlapping squares, top
   right of the file).
2. Open your Supabase project → **SQL Editor** (left sidebar) → **New query**.
3. Paste (Ctrl+V) and press **Run** (or Ctrl+Enter). If Supabase warns about "destructive operations", choose
   to run it anyway.
4. After a few seconds it says **Success. No rows returned**. That's it: all tables, security rules, storage
   buckets and the starting content (categories, editorial board, pages and one sample issue) are in place.

Running it twice is safe: the second time it stops with "AWLEL is already set up" and changes nothing.

## Step 2: Tell Supabase where the website lives

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** your Vercel address for now, e.g. `https://awlel-joural-xefd.vercel.app` (find it in Vercel →
  your project → **Domains**). Change it to your own domain later.
- **Redirect URLs** → Add: `https://awlel-joural-xefd.vercel.app/auth/callback` (same address + `/auth/callback`)
  and `https://*.vercel.app/auth/callback`.

Without this, the confirmation link in sign-up emails won't work.

## Step 3: Add the environment variables (Vercel)

Vercel → your project → **Settings** → **Environment Variables** → **Add Environment Variable**. Add each row
below. For **Environments**, tick **Production** and **Preview** (Development is optional).

| Name | Where to get the value |
| ---- | ---------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings** → **Data API** → *Project URL* (looks like `https://crayxkhengayylnsmzdb.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → **Project Settings** → **API Keys** → the **publishable** key (`sb_publishable_…`), or on the *Legacy API keys* tab the **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → the **secret** key (`sb_secret_…`, click *Reveal*), or the legacy **service_role** key. **Keep it private**: never put it in a `NEXT_PUBLIC_` variable or share it |
| `METRICS_SALT` | Any long random text you make up, 32 characters or more (letters and numbers). Keep it private |
| `CRON_SECRET` | Another, different long random text, 32+ characters. Keep it private |
| `ALERT_EMAIL` | Your email address: problems with the site are reported here |
| `EDITORIAL_EMAIL` | The journal's email (e.g. `awlel.journal@gmail.com`): new submissions and contact messages go here |

Add these later, when you have them:

| Name | When |
| ---- | ---- |
| `NEXT_PUBLIC_SITE_URL` | When your own domain works: `https://your-domain.com`. Until then the site uses its Vercel address by itself |
| `RESEND_API_KEY`, `EMAIL_FROM` | When email sending is set up with your domain (see `docs/DOMAIN_SETUP.md`). Until then, emails to authors and reviewers are only recorded, not sent |
| `RESEND_WEBHOOK_SECRET` | After adding the Resend webhook (`docs/RUNBOOK.md`, “Email delivery webhooks”) |

Leave **Enable access to System Environment Variables** ticked.

## Step 4: Deploy again

Vercel → **Deployments** → the newest one → **⋯** → **Redeploy**. After 2–3 minutes it should show **Ready**
(green) instead of Error. Click **Visit**: you should see the journal's home page with the sample issue.

If it still says Error, open it and copy the last red lines of the **Build Logs** into the chat.

## Step 5: Make yourself the Super Admin

1. On the live site, click **Sign in** → **Create an account**, and sign up with your email.
2. Open the confirmation email from Supabase and click the link.
3. Open
   [`supabase/setup/make-super-admin.sql`](https://github.com/An-israel/AWLEL-JOURAL/blob/claude/sleepy-brown-4e80zc/supabase/setup/make-super-admin.sql),
   copy it, paste it into Supabase → **SQL Editor** → **New query**, replace `YOUR-EMAIL@example.com` with the
   email you signed up with, and **Run**. The result shows your email with `super_admin`.
4. Sign in on the site again: you land on the admin dashboard. Invite editors and reviewers from **Admin →
   Users and Roles**.

## Step 6: Before announcing the site

- **Admin → Volumes and Issues:** delete the sample issue (Volume 26) and its three sample articles.
- **Admin → Pages** and **Editorial Board:** replace text marked *to confirm* / *to be verified*.
- **Admin → Settings:** upload the real logo and check the journal details.
- Then follow `docs/DOMAIN_SETUP.md` to connect your domain, and the runbook's “One-time setup” for backups,
  alerts and the uptime monitor.

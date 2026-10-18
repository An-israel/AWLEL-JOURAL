# Getting the site live: step by step

No command line needed: everything is done in the Supabase, Vercel, GitHub and Resend websites. Steps 1–7 take
about 45 minutes; step 8 needs your own domain and can take up to a day while its records spread. Do the steps
in order.

## Step 1: Set up the database (Supabase, once)

1. Open the file
   [`supabase/setup/production-setup.sql`](https://github.com/An-israel/AWLEL-JOURAL/blob/HEAD/supabase/setup/production-setup.sql)
   on GitHub (sign in to GitHub if asked). Click the **Copy raw file** button (two overlapping squares, top
   right of the file).
2. Open your Supabase project → **SQL Editor** (left sidebar) → **New query**.
3. Paste (Ctrl+V) and press **Run** (or Ctrl+Enter). If Supabase warns about "destructive operations", choose
   to run it anyway.
4. After a few seconds it shows a small **status table**. Everything is ready when it says:

   | item | status |
   | ---- | ------ |
   | Database updates applied | **N of N** (the two numbers are the same) |
   | Subject categories | 10 |
   | Static pages | 6 |
   | Published issues | 1 (the sample issue) |
   | Storage buckets | 4 of 4 |
   | Super Admins | 0 (until Step 7) |

You can run this file as often as you like. It only adds what is missing, never deletes anything, and leaves
an up-to-date database unchanged. **When new features come out, run the latest version of it again** to update
the database: that is the only database step updates ever need.

## Step 2: Tell Supabase where the website lives

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** your site's exact address, with no `/` at the end. For now that is your Vercel address, e.g.
  `https://awlel-joural-xefd.vercel.app` (Vercel → your project → **Domains**). When your own domain works
  (step 8), change it to that, e.g. `https://awlel-journal.org`. The emails in step 6 build their links from
  this address, so it must be the address the site really opens on.
- **Redirect URLs** → **Add URL:** the same address followed by `/auth/callback`, e.g.
  `https://awlel-joural-xefd.vercel.app/auth/callback`. Later add your own domain's in the same way, e.g.
  `https://awlel-journal.org/auth/callback`.

**Do not add a pattern such as `https://*.vercel.app/auth/callback`.** Anyone can put a site on a
`….vercel.app` address, so a pattern like that would let a stranger's site receive sign-in and password-reset
links meant for your users. Even a narrower pattern based on your project's name can be matched by someone
else naming their project to fit, so list exact addresses only.

*Preview deployments* (the test copies Vercel builds for each change) don't need sign-in to work. If you do
want to sign in on one, add that preview's exact address followed by `/auth/callback` (Vercel → the
deployment → **Domains** shows it, e.g. `https://awlel-joural-git-new-feature-yourname.vercel.app`), and
remove it when you are done.

## Step 3: Add the environment variables (Vercel)

Vercel → your project → **Settings** → **Environment Variables** → **Add Environment Variable**. Add each row
below. For **Environments**, tick **Production** and **Preview** (Development is optional). Paste values
without spaces before or after them.

| Name | Where to get the value |
| ---- | ---------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings** → **Data API** → *Project URL* (looks like `https://crayxkhengayylnsmzdb.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → **Project Settings** → **API Keys** → the **publishable** key (`sb_publishable_…`), or on the *Legacy API keys* tab the **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → the **secret** key (`sb_secret_…`, click *Reveal*), or the legacy **service_role** key. **Keep it private**: never put it in a `NEXT_PUBLIC_` variable or share it |
| `METRICS_SALT` | Any long random text you make up, 32 characters or more (letters and numbers). Keep it private |
| `CRON_SECRET` | Another, different long random text, 32+ characters. Keep it private |
| `ALERT_EMAIL` | Your email address: problems with the site are reported here (once email sending works, step 8) |
| `EDITORIAL_EMAIL` | The journal's email (e.g. `awlel.journal@gmail.com`): new submissions and contact messages go here |

Add these later, when you have them:

| Name | When |
| ---- | ---- |
| `NEXT_PUBLIC_SITE_URL` | When your own domain works: its exact address, e.g. `https://awlel-journal.org` (no `/` at the end). Until then the site uses its Vercel address by itself |
| `RESEND_API_KEY` **and** `EMAIL_FROM` | In step 8. The site sends email only when **both** are set. Until then, emails to authors, reviewers and editors wait in a queue (nothing is lost) and go out within about 30 minutes of adding both and redeploying. Emails that have waited more than two weeks are dropped, because they would arrive too late to be useful |
| `RESEND_WEBHOOK_SECRET` | After adding the Resend webhook (`docs/RUNBOOK.md`, “Email delivery webhooks”) |

Leave **Enable access to System Environment Variables** ticked.

If you mistype an optional value (for example a space inside `ALERT_EMAIL`), the site keeps working and ignores
that value; **Admin → Operations → Configuration** then shows it as *Not set*.

## Step 4: Put the site's servers next to the database (Vercel)

Every page asks the database for its content, so the site is fastest when Vercel runs it in the same part of
the world as Supabase.

1. Supabase → **Project Settings** → **General** (on some accounts **Infrastructure**): note the **Region** (e.g. *West EU (Ireland)* or *Central EU
   (Frankfurt)*).
2. Vercel → your project → **Settings** → **Functions** → **Function Region**: choose the region closest to it
   (Ireland → *Dublin, Ireland (dub1)*; Frankfurt → *Frankfurt, Germany (fra1)*; London → *London, England
   (lhr1)*) and **Save**. It takes effect from the next deployment (step 5).

## Step 5: Deploy again

Vercel → **Deployments** → the newest one → **⋯** → **Redeploy**. After 2–3 minutes it should show **Ready**
(green) instead of Error. Click **Visit**: you should see the journal's home page with the sample issue.

If it still says Error, open it and copy the last red lines of the **Build Logs** into the chat.

## Step 6: Update the email templates (Supabase)

Supabase's standard emails contain links that work only in the same browser that asked for them, so a
confirmation or password-reset link opened on a phone (or in another browser) fails, and **invitations to
editors and reviewers don't work at all**. Replace them with the versions below, which work anywhere.

Supabase → **Authentication** → **Emails** → **Templates**. For each template below: open its tab, replace the
**Subject** and the whole **Message body** with the text given (select everything in the box, then paste), and
press **Save**. Copy each body exactly, including `{{ .SiteURL }}` and `{{ .TokenHash }}`: Supabase fills
those in for every email.

**Confirm sign up**

Subject: `Confirm your AWLEL account`

```html
<h2>Confirm your email address</h2>
<p>Thank you for creating an account on the AWLEL journal website. Please confirm your email address:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/account">Confirm my email address</a></p>
<p>If you didn't create an account, you can ignore this email.</p>
```

**Invite user**

Subject: `You have been invited to the AWLEL journal`

```html
<h2>You have been invited</h2>
<p>You have been invited to join the AWLEL journal website as a member of its editorial team. Follow this link to accept and choose your password:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept the invitation</a></p>
<p>If you weren't expecting this, you can ignore this email.</p>
```

**Magic link** (the site doesn't send these today; this keeps the template correct if it ever does)

Subject: `Your AWLEL sign-in link`

```html
<h2>Sign in to AWLEL</h2>
<p>Follow this link to sign in:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/account">Sign in</a></p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

**Change email address**

Subject: `Confirm your new email address for AWLEL`

```html
<h2>Confirm your new email address</h2>
<p>Follow this link to confirm changing your AWLEL account's email address from {{ .Email }} to {{ .NewEmail }}:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/account">Confirm the change</a></p>
<p>If you didn't ask for this, please contact the journal.</p>
```

**Reset password**

Subject: `Reset your AWLEL password`

```html
<h2>Reset your password</h2>
<p>Someone (hopefully you) asked to reset the password for your AWLEL account. Follow this link to choose a new one:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
<p>If you didn't ask for this, you can ignore this email; your password stays the same.</p>
```

Where each link leads: a sign-up confirmation signs the person in and opens their **account** page; an
invitation and a password reset sign them in and open **Choose a password**. Leave the **Reauthentication**
template as it is: the site doesn't use it.

## Step 7: Make yourself the Super Admin

1. On the live site, click **Sign in** → **Create an account**, and sign up with your email.
2. Open the confirmation email from Supabase and click the link. (It reaches you because you own the Supabase
   project; other people's sign-up emails only arrive after step 8.)
3. Open
   [`supabase/setup/make-super-admin.sql`](https://github.com/An-israel/AWLEL-JOURAL/blob/HEAD/supabase/setup/make-super-admin.sql),
   copy it, paste it into Supabase → **SQL Editor** → **New query**, replace `YOUR-EMAIL@example.com` with the
   email you signed up with, and **Run**. The result shows your email with `super_admin`.
4. Sign in on the site again: you land on the admin dashboard. Invite editors and reviewers from **Admin →
   Users and Roles** once step 8 is done (until then their invitations won't arrive).

## Step 8: Connect your domain and set up email (required before announcing the site)

**Until this step is done, authors cannot create accounts.** Supabase's built-in email is only for trying
things out: it sends **only to members of your Supabase organisation** (people listed under Supabase →
Organization → Team), and only about **2 emails an hour** in total. Everyone else's sign-up confirmation,
password reset and invitation simply never arrives.

Follow [`docs/DOMAIN_SETUP.md`](DOMAIN_SETUP.md):

1. **Part 1, the website:** connect your domain in Vercel, then update `NEXT_PUBLIC_SITE_URL` and the Supabase
   **Site URL** and **Redirect URLs** (step 2) to the domain's exact address.
2. **Part 2, email:** verify the domain in Resend and add `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (both of
   them; one alone sends nothing), then redeploy. Emails that were waiting go out within about 30 minutes.
3. **Supabase custom SMTP** (Part 2, step 4): Supabase → **Authentication** → **Emails** → **SMTP Settings** →
   enable custom SMTP with Resend's details. This is what lets Supabase email people outside your team.
4. **Raise Supabase's email limit:** Supabase → **Authentication** → **Rate Limits** → *Rate limit for sending
   emails*: set it to about **100** an hour and **Save**. (This setting only appears once custom SMTP is on.
   Without raising it, a busy submission day can block sign-ups.)
5. **Test it:** sign up on the site with an address that is *not* in your Supabase team (for example a
   colleague's), and check the confirmation email arrives and its link works, ideally opened on a phone.

## Step 9: Before announcing the site

- **Admin → Volumes and Issues:** delete the sample issue (Volume 26) and its three sample articles.
- **Admin → Pages** and **Editorial Board:** replace text marked *to confirm* / *to be verified*.
- **Admin → Settings:** upload the real logo and check the journal details.
- Follow the runbook's “One-time setup” (`docs/RUNBOOK.md`) for scheduled tasks, backups, alerts and the uptime
  monitor.
- **Make the GitHub repository private** (GitHub → the repository → **Settings** → **General** → at the bottom,
  **Danger Zone** → **Change visibility** → **Make private**). The site's code doesn't need to be public, and a
  private repository keeps the details of how the site is run to the people you choose. Vercel keeps deploying
  it as long as the repository belongs to your personal GitHub account. The scheduled tasks then count against
  GitHub's 2,000 free Actions minutes a month; they use about 1,500.

## Good to know

**Vercel Hobby or Pro.** The site runs on Vercel's free *Hobby* plan, which Vercel describes as being for
personal, non-commercial use. Whether a university journal's site fits that is for you and the department to
decide from Vercel's current terms (vercel.com/pricing and the fair use guidelines). The *Pro* plan is paid per
team member per month and is intended for organisations and commercial use; it also adds team access and
higher limits. Switching is done in Vercel → **Settings** → **Billing** and needs no change to the site.

**Supabase pauses idle free projects.** On the Free plan, Supabase pauses a project that has had no activity for
about a week. The site's daily maintenance task and the uptime monitor (runbook, “Uptime monitor”) normally keep
it awake. If the site ever shows errors and Supabase says the project is **Paused**: Supabase dashboard → your
project → **Restore project**, then wait a few minutes. Restore it promptly: after a long pause (Supabase
currently says 90 days) it can no longer be restored from the dashboard. If pauses happen repeatedly, consider
Supabase Pro.

**GitHub switches off scheduled tasks in public repositories** after 60 days without any change to the
repository. GitHub usually sends an email warning a few days before, saying a scheduled workflow will be
disabled soon. The “Scheduled tasks” workflow re-enables itself and the backup once a day,
so this shouldn't happen; if it does, see the runbook, “Scheduled tasks not running”. Private repositories
aren't affected.

**Files are limited to 50 MB each**, the most Supabase's Free plan accepts for one upload. Compress larger PDFs
before uploading. Supabase Pro allows larger files (a small change for a developer; runbook, “Uploads
failing”).

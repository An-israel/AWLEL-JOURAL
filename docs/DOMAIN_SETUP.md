# Connecting your own domain

For a domain you buy yourself (for example `awlel-journal.org`) from a registrar such as Namecheap, GoDaddy,
Porkbun or Cloudflare. Two parts, both required before the site is announced: the **website** and **email**
(without it, authors never receive their sign-up confirmation, and no email from the site goes out). Both are done in the registrar's DNS settings; changes usually work within an hour, sometimes up to
a day.

## 1. The website

1. Vercel → your project → **Settings** → **Domains** → **Add** → type your domain (e.g. `awlel-journal.org`).
   Choose the recommended option of adding **both** `awlel-journal.org` and `www.awlel-journal.org`, with one
   redirecting to the other.
2. Vercel then shows the records it needs. Typically:

   | Type  | Name / Host | Value                                            |
   | ----- | ----------- | ------------------------------------------------ |
   | A     | `@`         | `76.76.21.21` (use the IP Vercel shows)          |
   | CNAME | `www`       | `cname.vercel-dns.com` (use the value Vercel shows) |

3. At your registrar, open the domain's **DNS** (or "Advanced DNS") page and:
   - delete any existing **A**, **AAAA** or **CNAME** records for `@` and `www` that point elsewhere (often a
     "parked page" record the registrar adds);
   - add the two records exactly as Vercel shows them.
4. Back in Vercel, the domain turns to **Valid Configuration** and HTTPS is set up automatically.

   *Alternative:* instead of the records, change the domain's **nameservers** at the registrar to
   `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Then Vercel manages all DNS, and the email records below are
   added in Vercel → **Domains** → your domain → **DNS Records** instead.

5. **Find the exact address.** One of the two addresses redirects to the other (Vercel → **Domains** shows
   which one, marked *Redirects to…*). Use the other one, the *primary* address, everywhere below: open the
   site in a browser and copy what stays in the address bar, without the `/` at the end (e.g.
   `https://www.awlel-journal.org` or `https://awlel-journal.org`). The redirecting address works for
   visitors, but the scheduled tasks and backups can't follow it and stop with “SITE_URL redirects to …”.
6. Then update three places with that exact address:
   - Vercel → Environment Variables: `NEXT_PUBLIC_SITE_URL` = `https://awlel-journal.org` → Redeploy.
   - Supabase → Authentication → URL Configuration: **Site URL** = `https://awlel-journal.org`; add
     `https://awlel-journal.org/auth/callback` to Redirect URLs.
   - GitHub secret `SITE_URL` (if you've set up the scheduled tasks and backups from the runbook): GitHub →
     the repository → **Settings** → **Secrets and variables** → **Actions** → `SITE_URL` → **Update**.

## 2. Email (Resend)

The site emails authors and reviewers (submission receipts, review invitations, decisions). To send from
your domain, for example `no-reply@awlel-journal.org`:

1. Create a free account at [resend.com](https://resend.com) → **Domains** → **Add Domain** → your domain
   (pick the region closest to Nigeria that Resend offers, e.g. Ireland `eu-west-1`).
2. Resend lists 3–4 records. Add each one at your registrar exactly as shown. They look like this:

   | Type | Name / Host          | Value (example; copy Resend's)                 | Priority |
   | ---- | -------------------- | ---------------------------------------------- | -------- |
   | MX   | `send`               | `feedback-smtp.eu-west-1.amazonses.com`        | 10       |
   | TXT  | `send`               | `v=spf1 include:amazonses.com ~all`            |          |
   | TXT  | `resend._domainkey`  | `p=MIGfMA0GCSq…` (long key, one line)          |          |
   | TXT  | `_dmarc`             | `v=DMARC1; p=none; rua=mailto:you@your-email` |          |

   Some registrars add the domain to the name automatically: enter `send`, not `send.awlel-journal.org`.
3. In Resend, press **Verify**. When every record shows **Verified**:
   - Resend → **API Keys** → **Create API Key** (sending access) → copy it.
   - Vercel → Environment Variables: `RESEND_API_KEY` = that key; `EMAIL_FROM` =
     `AWLEL Journal <no-reply@awlel-journal.org>` → Redeploy.
   - **Set both.** The site sends email only when both are set, and `EMAIL_FROM` must use the domain you just
     verified. Until then, emails wait in a queue and nothing is lost: they go out within about 30 minutes of
     the redeploy. Admin → Operations → **Configuration** shows both as *Set* when it is right.
4. **No Supabase SMTP needed.** Once both are set, the site sends the account emails too (sign-up
   confirmation, password reset, invitations), in the journal's design. Supabase's SMTP settings, templates
   and email limits can stay as they are.
5. Test with an address outside your Supabase team: sign up on the site and check the confirmation email
   arrives, and that its link works (ideally opened on a phone).
6. After about four weeks without delivery problems, change the DMARC record's `p=none` to `p=quarantine`.

**If the journal later moves to `awlel.unn.edu.ng`:** the same records apply, but UNN ICT creates them in the
`unn.edu.ng` DNS (a CNAME `awlel` → the Vercel value, and the Resend records under `awlel`).

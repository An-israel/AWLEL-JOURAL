# DNS setup for awlel.unn.edu.ng

**For:** UNN ICT unit (DNS administrators for `unn.edu.ng`)
**From:** AWLEL journal, Department of English and Literary Studies
**Purpose:** point `awlel.unn.edu.ng` at the journal's website, hosted on Vercel, and (optionally) let the
journal send email from a `unn.edu.ng` address without landing in spam.

Nothing else in `unn.edu.ng` changes. All records below are additions for the `awlel` name only.

## 1. Website (required)

| Type  | Host / Name | Value                  | TTL  |
| ----- | ----------- | ---------------------- | ---- |
| CNAME | `awlel`     | `cname.vercel-dns.com.` | 3600 |

- The journal's Super Admin will confirm the exact value before you start: Vercel sometimes shows a
  project-specific target (for example `1a2b3c4d5e6f.vercel-dns-017.com`). Use the value they send if it differs.
- If `awlel.unn.edu.ng` already has **A** or **AAAA** records, remove them: a name can't have both a CNAME
  and other records.
- If `unn.edu.ng` has **CAA** records, add one so the free HTTPS certificate can be issued:

  | Type | Host / Name | Value                       |
  | ---- | ----------- | --------------------------- |
  | CAA  | `awlel`     | `0 issue "letsencrypt.org"` |

- Only if Vercel reports the domain is linked to another account, it will show a **TXT** record named
  `_vercel` to prove ownership; the journal will send you its value.

HTTPS is set up automatically within minutes of the record working, and renewed automatically. Please
don't remove or change this record without telling the journal: the site and its certificate depend on it.

**Check:** `dig +short CNAME awlel.unn.edu.ng` returns the Vercel value; `https://awlel.unn.edu.ng` opens the
journal.

## 2. Email (optional, only if the journal sends from a unn.edu.ng address)

The website emails authors and reviewers (submission receipts, review invitations, decisions) through
Resend. If the journal sends from its own separately bought domain, none of this involves UNN ICT. If it
sends from `awlel.unn.edu.ng` (for example `no-reply@awlel.unn.edu.ng`), these records are needed so mail
is authenticated and isn't marked as spam. They only affect mail *sent by the website*; UNN's own mail and
MX records are untouched.

The journal's Super Admin adds `awlel.unn.edu.ng` in Resend (Domains → Add) and sends you the exact values;
they look like this:

| Type | Host / Name                         | Value (example; use the values Resend shows)            | Priority |
| ---- | ----------------------------------- | -------------------------------------------------------- | -------- |
| MX   | `send.awlel`                        | `feedback-smtp.eu-west-1.amazonses.com.`                | 10       |
| TXT  | `send.awlel`                        | `v=spf1 include:amazonses.com ~all`                      |          |
| TXT  | `resend._domainkey.awlel`           | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4…` (the DKIM key, one line) |          |
| TXT  | `_dmarc.awlel`                      | `v=DMARC1; p=none; rua=mailto:awlel.journal@gmail.com`   |          |

- **SPF and the MX record** sit on the `send.awlel` sub-name, so they don't affect any other SPF record.
- **DKIM** signs the website's messages; Resend shows the key once the domain is added.
- **DMARC** starts with `p=none` (report only). After about four weeks without problems the journal will ask
  you to change it to `p=quarantine`.

**Check:** Resend marks every record as *Verified*; `dig +short TXT resend._domainkey.awlel.unn.edu.ng`
returns the key.

## Contacts

| Who | For |
| --- | --- |
| Journal Super Admin (name, email, phone: fill in) | Values to use, and testing after each change |
| UNN ICT DNS administrator | Making the changes |

Thank you. The full technical setup is in the journal's repository (`README.md` and `docs/RUNBOOK.md`).

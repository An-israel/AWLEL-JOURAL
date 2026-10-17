# Postmortem: <short title>

Copy this file to `docs/postmortems/YYYY-MM-DD-short-title.md` and fill it in within a week of the incident.

**This is blameless.** The aim is to understand how the system and our processes allowed the problem, not who
made a mistake. Write about decisions and what people knew at the time, not about fault. Anyone involved should
feel safe saying exactly what they did.

| | |
| --- | --- |
| **Date of incident** | YYYY-MM-DD |
| **Author(s)** | |
| **Status** | Draft / Reviewed / Action items done |
| **Severity** | Site down · Feature broken · Degraded |
| **Duration** | From first impact to full recovery (hh:mm) |
| **Error budget used** | Minutes of downtime counted against the 3h 36m monthly budget |

## Summary

Two or three sentences a non-technical editor can understand: what broke, who was affected, how it was fixed.

## Impact

- **Who was affected:** readers, authors, reviewers, editors (how many, if known).
- **What they could not do:** e.g. download articles, submit manuscripts, receive emails.
- **Data:** was anything lost or wrong? (e.g. emails delayed but all sent; one file served by mistake for 2 hours)
- **Reputation:** did authors or partners notice? Was anything public?

## Timeline

All times in WAT (UTC+1). Include when it started, when we noticed, key decisions, and when it was resolved.

| Time | What happened |
| ---- | ------------- |
| 09:12 | (example) Deployment `abc1234` went live. |
| 09:40 | (example) Uptime monitor alerted the Super Admin: `/api/health` returning 503. |
| | |

**Time to detect:** start → first alert or report.
**Time to resolve:** first alert → full recovery.

## Root cause

What actually caused it, going past the first answer. Asking "why?" several times usually helps:

1. Why did readers see errors? …
2. Why did that happen? …
3. Why wasn't it caught earlier (tests, preview, alerts)? …

## Detection

How did we find out: an alert, the uptime monitor, a reader? Could we have found out sooner? Did any alert fail
to fire, or fire too late?

## Response and recovery

What we did to fix it, in order, and what helped or slowed us down (the runbook, access to dashboards,
knowing who to call).

## What went well

Things to keep: e.g. the rollback took one minute; queued emails were all delivered afterwards.

## What went badly or was lucky

Things that made it worse, and anything that limited the damage by chance rather than by design.

## Action items

Each item has one owner and a date. Prefer changes that make the problem impossible or detected automatically
over "be more careful".

| # | Action | Type | Owner | Due | Done |
| - | ------ | ---- | ----- | --- | ---- |
| 1 | (example) Add a test that the health check fails when storage does | Prevent | | | ☐ |
| 2 | (example) Lower the error-rate alert threshold | Detect | | | ☐ |
| 3 | (example) Add this case to `docs/RUNBOOK.md` | Respond | | | ☐ |

Types: **Prevent** (stop it happening), **Detect** (notice sooner), **Respond** (fix faster), **Learn** (share it).

## Supporting material

Links to logs (Vercel Logs search with the request ids), traces, the alert emails, the deployment, the pull
request with the fix, and any messages sent to authors.

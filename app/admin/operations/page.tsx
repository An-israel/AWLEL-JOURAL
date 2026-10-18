import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env.server";
import { evaluateAlerts } from "@/lib/ops/alerts";
import { opsSnapshot } from "@/lib/server/cron";
import { checkDependencies } from "@/lib/server/health";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeadLetterButtons, RunTaskButton, UnsuppressButton } from "./ops-controls";

export const metadata: Metadata = { title: "Operations" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

// What each recorded task is, and how often it should run.
const TASK_ROWS = [
  { task: "frequent", label: "Queue worker (scheduled)", schedule: "Every 30 minutes (GitHub Actions)" },
  { task: "daily", label: "Daily maintenance", schedule: "Daily at 05:17 UTC (Vercel Cron)" },
  { task: "backup", label: "Backup", schedule: "Mondays 02:40 UTC (GitHub Actions)" },
  { task: "queue", label: "Queue", schedule: "Part of both schedules", runnable: true },
  { task: "reminders", label: "Review reminders", schedule: "Daily", runnable: true },
  { task: "rollup", label: "Metrics rollup", schedule: "Daily", runnable: true },
  { task: "cleanup", label: "Cleanup", schedule: "Daily", runnable: true },
  { task: "alerts", label: "Alert check", schedule: "Part of both schedules", runnable: true },
] as const;

/** Server components render once per request, so reading the clock here is fine. */
function clock() {
  const now = Date.now();
  return { now, nowIso: new Date(now).toISOString(), dayAgoIso: new Date(now - 86_400_000).toISOString() };
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function RunStatus({ status }: { status: string | undefined }) {
  if (!status) return <Badge variant="muted">Never run</Badge>;
  const variant = status === "succeeded" ? "green" : status === "failed" ? "coral" : "muted";
  const label =
    status === "succeeded"
      ? "Succeeded"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Running"
          : "Skipped";
  return <Badge variant={variant}>{label}</Badge>;
}

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

async function Content() {
  await requireRole(["super_admin"], "/admin/operations");
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();
  const { now: nowMs, nowIso: now, dayAgoIso: dayAgo } = clock();

  const [snapshot, health, ready, waiting, running, done24h, runs, deadLetters, circuits, suppressions] =
    await Promise.all([
      opsSnapshot(),
      checkDependencies(),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .lte("run_at", now),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .gt("run_at", now),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "succeeded")
        .gte("updated_at", dayAgo),
      supabase
        .from("cron_runs")
        .select("task, status, started_at, finished_at, detail, error")
        .order("started_at", { ascending: false })
        .limit(300),
      supabase
        .from("dead_letter_jobs")
        .select("id, job_type, payload, attempts, last_error, failed_at")
        .is("resolved_at", null)
        .order("failed_at", { ascending: false })
        .limit(50),
      supabase.from("circuit_breakers").select("name, failures, opened_until"),
      supabase
        .from("email_suppressions")
        .select("email, reason, created_at")
        .order("created_at", { ascending: false }),
    ]);

  const alerts = evaluateAlerts(snapshot);
  const lastRun = new Map<string, NonNullable<typeof runs.data>[number]>();
  for (const r of runs.data ?? []) if (!lastRun.has(r.task)) lastRun.set(r.task, r);

  const config = [
    { name: "CRON_SECRET", set: Boolean(env.CRON_SECRET), why: "scheduled tasks and backup reports" },
    {
      name: "RESEND_API_KEY",
      set: Boolean(env.RESEND_API_KEY),
      why: "sending email, together with EMAIL_FROM (until both are set, emails wait in the queue)",
    },
    {
      name: "EMAIL_FROM",
      set: Boolean(env.EMAIL_FROM),
      why: "the sender address on the journal's domain, e.g. AWLEL Journal <no-reply@your-domain>",
    },
    {
      name: "RESEND_WEBHOOK_SECRET",
      set: Boolean(env.RESEND_WEBHOOK_SECRET),
      why: "bounce and complaint handling",
    },
    { name: "ALERT_EMAIL", set: Boolean(env.ALERT_EMAIL), why: "where alerts are sent" },
    { name: "SENTRY_DSN", set: Boolean(env.SENTRY_DSN), why: "error tracking (optional)" },
  ];

  return (
    <>
      <div
        role="status"
        className={`mt-6 flex items-start gap-3 rounded-lg border p-4 ${
          alerts.length ? "border-coral/40 bg-[#FDECEE]" : "border-[#2F6B22]/30 bg-[#EEF6EA]"
        }`}
      >
        {alerts.length ? (
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-coral-ink" />
        ) : (
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[#2F6B22]" />
        )}
        <div>
          <p className="font-semibold">
            {alerts.length
              ? `${alerts.length} ${alerts.length === 1 ? "problem needs" : "problems need"} attention`
              : "All systems normal"}
          </p>
          {alerts.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {alerts.map((a) => (
                <li key={a.key}>
                  <strong className="font-semibold">{a.title}.</strong> {a.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Database and storage respond, nothing has failed for good, and scheduled tasks are on time.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            {env.ALERT_EMAIL
              ? `Alerts are emailed to ${env.ALERT_EMAIL} (at most once a day each).`
              : "Set ALERT_EMAIL in Vercel to have alerts emailed to you."}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ...Object.entries(health.checks).map(([name, c]) => ({
            label: name === "database" ? "Database" : "Storage",
            value: c.ok ? `${c.latencyMs} ms` : "Not responding",
            ok: c.ok,
          })),
          {
            label: "Jobs ready to run",
            value: String(ready.count ?? 0),
            ok:
              !snapshot.oldestReadyJobAt || nowMs - new Date(snapshot.oldestReadyJobAt).getTime() < 3_600_000,
          },
          { label: "Waiting to retry", value: String((waiting.count ?? 0) + (running.count ?? 0)), ok: true },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-line bg-white p-4">
            <dt className="flex items-center gap-1.5 text-sm text-ink-muted">
              {card.ok ? (
                <CircleCheck aria-label="OK" className="size-4 text-[#2F6B22]" />
              ) : (
                <CircleAlert aria-label="Problem" className="size-4 text-coral-ink" />
              )}
              {card.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold text-navy">{card.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        {(done24h.count ?? 0).toLocaleString("en")} jobs completed in the last 24 hours.
        {snapshot.oldestReadyJobAt ? ` Oldest waiting job queued ${ago(snapshot.oldestReadyJobAt)}.` : ""}
      </p>

      <Section id="tasks-title" title="Scheduled tasks">
        <Table>
          <THead>
            <tr>
              <Th>Task</Th>
              <Th className="hidden md:table-cell">Schedule</Th>
              <Th>Last run</Th>
              <Th className="hidden lg:table-cell">Result</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {TASK_ROWS.map((row) => {
              const run = lastRun.get(row.task);
              return (
                <Tr key={row.task}>
                  <Td className="font-medium">{row.label}</Td>
                  <Td className="hidden text-ink-muted md:table-cell">{row.schedule}</Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <RunStatus status={run?.status} />
                      <span
                        className="text-sm text-ink-muted"
                        title={run ? when.format(new Date(run.started_at)) : undefined}
                      >
                        {ago(run?.started_at)}
                      </span>
                    </span>
                  </Td>
                  <Td className="hidden max-w-sm text-xs text-ink-muted lg:table-cell">
                    {run?.error ??
                      (run?.detail
                        ? Object.entries(run.detail as Record<string, unknown>)
                            .map(
                              ([k, v]) =>
                                `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${Array.isArray(v) ? v.join(", ") || "none" : String(v)}`,
                            )
                            .join(" · ")
                        : "")}
                  </Td>
                  <Td className="text-right">
                    {"runnable" in row ? <RunTaskButton task={row.task} label={row.label} /> : null}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Section>

      <Section id="dead-title" title={`Failed jobs (${deadLetters.data?.length ?? 0})`}>
        {!deadLetters.data?.length ? (
          <EmptyState title="No failed jobs">
            Jobs that keep failing after six attempts, or that can never succeed, appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {deadLetters.data.map((d) => {
              const payload = d.payload as { to?: string | string[]; subject?: string };
              return (
                <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {d.job_type === "email.send"
                        ? `Email: ${payload.subject ?? "(no subject)"}`
                        : d.job_type}
                    </p>
                    <p className="text-ink-muted">
                      {payload.to ? `To ${[payload.to].flat().join(", ")} · ` : ""}
                      {d.attempts} {d.attempts === 1 ? "attempt" : "attempts"} · failed{" "}
                      {when.format(new Date(d.failed_at))}
                    </p>
                    {d.last_error ? (
                      <p className="mt-1 font-mono text-xs break-all text-coral-ink">{d.last_error}</p>
                    ) : null}
                  </div>
                  <DeadLetterButtons id={d.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section id="email-title" title="Email delivery">
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Email provider (Resend)</span>
              {(() => {
                const c = circuits.data?.find((x) => x.name === "resend");
                const open = c?.opened_until && new Date(c.opened_until).getTime() > nowMs;
                return open ? (
                  <Badge variant="coral">Paused until {when.format(new Date(c.opened_until!))}</Badge>
                ) : (
                  <Badge variant="green">
                    {c?.failures ? `Working (${c.failures} recent failures)` : "Working"}
                  </Badge>
                );
              })()}
            </li>
            {(suppressions.data ?? []).map((s) => (
              <li key={s.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 break-all">
                  {s.email}{" "}
                  <span className="text-ink-muted">
                    · {s.reason === "bounced" ? "bounced" : "marked as spam"}
                  </span>
                </span>
                <UnsuppressButton email={s.email} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Addresses that bounce or mark our email as spam are not emailed again until you allow them.
          </p>
        </Section>

        <Section id="config-title" title="Configuration">
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
            {config.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <code className="text-xs">{c.name}</code> <span className="text-ink-muted">· {c.why}</span>
                </span>
                {c.set ? (
                  <span className="inline-flex items-center gap-1 text-[#2F6B22]">
                    <CircleCheck aria-hidden className="size-4" /> Set
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-ink-muted">
                    <CircleMinus aria-hidden className="size-4" /> Not set
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Values are never shown here. Change them in Vercel → Settings → Environment Variables.
          </p>
        </Section>
      </div>
    </>
  );
}

export default function OperationsPage() {
  return (
    <>
      <AdminPageHeader
        title="Operations"
        crumbs={[{ label: "Operations" }]}
        description="Health, background jobs, scheduled tasks and email delivery. The runbook (docs/RUNBOOK.md) says what to do when something here is red."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Content />
      </Suspense>
    </>
  );
}

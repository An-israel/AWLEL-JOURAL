import "server-only";
import { randomUUID } from "node:crypto";
import { evaluateAlerts, type OpsSnapshot } from "@/lib/ops/alerts";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { emailConfigured, sendEmail } from "./email";
import { siteUrl } from "@/lib/env.public";
import { checkDependencies } from "./health";
import { drainQueue } from "./jobs";
import { logger } from "./logger";
import { notifyReviewReminder } from "./notify";
import { certificateDaysLeft } from "./tls";
import { withSpan } from "./tracing";

/*
 * Scheduled tasks (item 21). Each run takes a lease (a distributed lock with
 * a time limit, item 38) so overlapping invocations never do the same work
 * twice, and is recorded in cron_runs for the Operations page and alerts.
 *
 *   daily  (Vercel Cron, once a day): reminders, rollup, cleanup, queue, alerts
 *   queue  (GitHub Actions, every 30 minutes): queue, alerts
 *   backup (GitHub Actions, weekly): reported here by the workflow
 */

export const TASKS = ["queue", "reminders", "rollup", "cleanup", "alerts"] as const;
export type TaskName = (typeof TASKS)[number];
export type Schedule = "daily" | "queue";

const SCHEDULES: Record<Schedule, TaskName[]> = {
  daily: ["reminders", "rollup", "cleanup", "queue", "alerts"],
  queue: ["queue", "alerts"],
};

export interface TaskReport {
  task: string;
  status: "succeeded" | "failed" | "skipped";
  detail: Record<string, unknown>;
  error?: string;
}

type Detail = Record<string, unknown>;

const today = () => new Date().toISOString().slice(0, 10);

const handlers: Record<TaskName, (holder: string) => Promise<Detail>> = {
  queue: async (holder) => ({ ...(await drainQueue(holder)) }),

  reminders: async () => {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("due_review_reminders");
    if (error) throw new Error(error.message);
    let sent = 0;
    for (const r of data ?? []) {
      await notifyReviewReminder({
        assignmentId: r.assignment_id,
        reviewerEmail: r.reviewer_email,
        reviewerName: r.reviewer_name,
        title: r.title,
        dueDate: r.due_date,
        today: today(),
      });
      await supabase
        .from("review_assignments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", r.assignment_id);
      sent++;
    }
    return { reminders: sent };
  },

  rollup: async () => {
    const { data, error } = await createSupabaseAdminClient().rpc("rollup_metrics");
    if (error) throw new Error(error.message);
    return { dailyRows: data };
  },

  cleanup: async () => {
    const supabase = createSupabaseAdminClient();
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

    // Abandoned uploads: objects with no database row (item 19).
    const { data: orphans, error } = await supabase.rpc("orphaned_objects", {
      p_older_than_hours: 24,
      p_limit: 500,
    });
    if (error) throw new Error(error.message);
    const byBucket = new Map<string, string[]>();
    for (const o of orphans ?? []) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
    let removed = 0;
    for (const [bucket, names] of byBucket) {
      const { data: gone } = await supabase.storage.from(bucket).remove(names);
      removed += gone?.length ?? 0;
    }

    // Retention: finished work and logs that are no longer useful.
    const results = await Promise.all([
      supabase.from("jobs").delete({ count: "exact" }).eq("status", "succeeded").lt("updated_at", days(30)),
      supabase.from("cron_runs").delete({ count: "exact" }).lt("started_at", days(90)),
      supabase
        .from("dead_letter_jobs")
        .delete({ count: "exact" })
        .not("resolved_at", "is", null)
        .lt("resolved_at", days(90)),
      supabase.from("webhook_events").delete({ count: "exact" }).lt("received_at", days(30)),
      supabase.from("rate_limits").delete({ count: "exact" }).lt("window_start", days(1)),
    ]);
    const [jobs, runs, deadLetters, webhooks, rateLimits] = results.map((r) => r.count ?? 0);
    return { orphanedFiles: removed, jobs, runs, deadLetters, webhooks, rateLimits };
  },

  alerts: async () => {
    const snapshot = await opsSnapshot();
    const alerts = evaluateAlerts(snapshot);
    // Without email set up the alerts are only logged (and shown on Admin →
    // Operations); emailConfigured() says so in the logs once.
    const to = emailConfigured() ? serverEnv().ALERT_EMAIL : undefined;
    for (const alert of alerts) {
      logger.error({ alert: alert.key }, `ALERT: ${alert.title}`);
      if (!to) continue;
      // Sent directly, not through the queue, which may be what is broken.
      // The idempotency key limits each alert to one email a day.
      await sendEmail(
        {
          to,
          subject: `[AWLEL alert] ${alert.title}`,
          text: `${alert.detail}\n\nThis alert is sent at most once a day while the problem lasts.\nRunbook: docs/RUNBOOK.md in the repository.`,
        },
        `alert:${alert.key}:${today()}`,
      ).catch((err: unknown) => logger.error({ err, alert: alert.key }, "could not send alert email"));
    }
    return { alerts: alerts.map((a) => a.key), emailed: Boolean(to) };
  },
};

async function lastSuccess(task: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from("cron_runs")
    .select("finished_at")
    .eq("task", task)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finished_at ?? null;
}

/** Everything the alert rules and the Operations page look at. */
export async function opsSnapshot(): Promise<OpsSnapshot> {
  const supabase = createSupabaseAdminClient();
  const [deadLetters, oldest, circuits, queue, daily, backup, health, errors, certificate] =
    await Promise.all([
      supabase.from("dead_letter_jobs").select("id", { count: "exact", head: true }).is("resolved_at", null),
      supabase
        .from("jobs")
        .select("run_at")
        .eq("status", "queued")
        .lte("run_at", new Date().toISOString())
        .order("run_at")
        .limit(1)
        .maybeSingle(),
      supabase.from("circuit_breakers").select("name").gt("opened_until", new Date().toISOString()),
      lastSuccess("queue"),
      lastSuccess("daily"),
      lastSuccess("backup"),
      checkDependencies(),
      supabase.rpc("errors_since", { p_minutes: 60 }),
      certificateDaysLeft(siteUrl),
    ]);
  return {
    now: new Date(),
    openDeadLetters: deadLetters.count ?? 0,
    oldestReadyJobAt: oldest.data?.run_at ?? null,
    openCircuits: (circuits.data ?? []).map((c) => c.name),
    lastSuccess: { queue, daily, backup },
    failingDependencies: Object.entries(health.checks)
      .filter(([, c]) => !c.ok)
      .map(([name]) => name),
    errorsLastHour: errors.data ?? 0,
    certificateDaysLeft: certificate,
  };
}

/** Records a run started and finished outside this process (the backup workflow). */
export async function recordExternalRun(
  task: string,
  status: "succeeded" | "failed",
  detail: Detail,
  error?: string,
) {
  const { error: dbError } = await createSupabaseAdminClient()
    .from("cron_runs")
    .insert({
      task,
      status,
      finished_at: new Date().toISOString(),
      detail: detail as { [key: string]: Json },
      error,
    });
  if (dbError) throw new Error(dbError.message);
}

async function runOne(task: string, fn: (holder: string) => Promise<Detail>): Promise<TaskReport> {
  const supabase = createSupabaseAdminClient();
  const holder = `${task}:${randomUUID()}`;
  const { data: acquired, error: leaseError } = await supabase.rpc("cron_acquire", {
    p_name: task,
    p_holder: holder,
    p_ttl_seconds: 300,
  });
  if (leaseError) throw new Error(`cron lease: ${leaseError.message}`);
  if (!acquired) return { task, status: "skipped", detail: { reason: "already running" } };

  const { data: run } = await supabase
    .from("cron_runs")
    .insert({ task, status: "running" })
    .select("id")
    .single();
  const finish = (status: "succeeded" | "failed", detail: Detail, error?: string) =>
    run
      ? supabase
          .from("cron_runs")
          .update({
            status,
            detail: detail as { [key: string]: Json },
            error,
            finished_at: new Date().toISOString(),
          })
          .eq("id", run.id)
      : Promise.resolve();
  try {
    const detail = await withSpan(`cron.${task}`, { "cron.task": task }, () => fn(holder));
    await finish("succeeded", detail);
    return { task, status: "succeeded", detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, task }, "scheduled task failed");
    await finish("failed", {}, message);
    return { task, status: "failed", detail: {}, error: message };
  } finally {
    await supabase.rpc("cron_release", { p_name: task, p_holder: holder });
  }
}

/** Runs one task now (also used by "Run now" on the Operations page). */
export function runTask(task: TaskName): Promise<TaskReport> {
  return runOne(task, handlers[task]);
}

/**
 * Runs a schedule's tasks in order. One failing task doesn't stop the rest.
 * The schedule itself is recorded too (daily's record feeds the alerts).
 */
export async function runSchedule(schedule: Schedule): Promise<TaskReport[]> {
  const reports: TaskReport[] = [];
  // Recorded as "daily" or "frequent"; the inner tasks record themselves.
  const outer = await runOne(schedule === "daily" ? "daily" : "frequent", async () => {
    for (const task of SCHEDULES[schedule]) reports.push(await runTask(task));
    return { tasks: reports.map((r) => `${r.task}:${r.status}`) };
  });
  return [...reports, outer];
}

// Alert rules (item 62). Pure, so the thresholds are unit tested. The cron
// collects a snapshot and emails ALERT_EMAIL about anything that fires; each
// alert is sent at most once a day.

export interface OpsSnapshot {
  now: Date;
  openDeadLetters: number;
  oldestReadyJobAt: string | null;
  openCircuits: string[];
  /** Last successful run per cron task (ISO), or null if never. */
  lastSuccess: Partial<Record<"queue" | "daily" | "backup", string | null>>;
  failingDependencies: string[];
  /** Server errors in the last hour. */
  errorsLastHour: number;
  /** Days until the TLS certificate expires; null when not checked. */
  certificateDaysLeft: number | null;
}

export interface Alert {
  key: string;
  title: string;
  detail: string;
}

const HOUR = 3_600_000;

function hoursSince(iso: string | null | undefined, now: Date): number {
  return iso ? (now.getTime() - new Date(iso).getTime()) / HOUR : Number.POSITIVE_INFINITY;
}

export const ALERT_THRESHOLDS = {
  queueBacklogHours: 1,
  queueStaleHours: 26,
  dailyStaleHours: 26,
  backupStaleHours: 8 * 24,
  errorsPerHour: 25,
  certificateDays: 14,
} as const;

export function evaluateAlerts(s: OpsSnapshot): Alert[] {
  const alerts: Alert[] = [];
  if (s.failingDependencies.length > 0) {
    alerts.push({
      key: "dependencies",
      title: `Site dependency failing: ${s.failingDependencies.join(", ")}`,
      detail: "The health check could not reach these services. See the runbook: “Site down or erroring”.",
    });
  }
  if (s.errorsLastHour >= ALERT_THRESHOLDS.errorsPerHour) {
    alerts.push({
      key: "error-rate",
      title: `${s.errorsLastHour} server errors in the last hour`,
      detail:
        "Visitors are seeing errors. Check Vercel → Logs (filter by error) and the runbook: “Site down or erroring”.",
    });
  }
  if (s.certificateDaysLeft !== null && s.certificateDaysLeft < ALERT_THRESHOLDS.certificateDays) {
    alerts.push({
      key: "certificate",
      title: `The site's HTTPS certificate expires in ${Math.max(0, s.certificateDaysLeft)} days`,
      detail:
        "Vercel renews it automatically unless the domain's DNS records changed. See the runbook: “Certificate”.",
    });
  }
  if (s.openDeadLetters > 0) {
    alerts.push({
      key: "dead-letters",
      title: `${s.openDeadLetters} background ${s.openDeadLetters === 1 ? "job has" : "jobs have"} failed for good`,
      detail: "Open Admin → Operations to see the error, then retry or discard each one.",
    });
  }
  if (s.oldestReadyJobAt && hoursSince(s.oldestReadyJobAt, s.now) > ALERT_THRESHOLDS.queueBacklogHours) {
    alerts.push({
      key: "queue-backlog",
      title: "Emails and other background jobs are waiting longer than an hour",
      detail: "The queue worker may not be running. See the runbook: “Emails not arriving”.",
    });
  }
  if (s.openCircuits.length > 0) {
    alerts.push({
      key: "circuit-open",
      title: `Provider unavailable: ${s.openCircuits.join(", ")}`,
      detail: "Calls are paused and the work is queued; it resumes by itself when the provider recovers.",
    });
  }
  // A task that has never run is not "stale" (fresh deploys); backups are the
  // exception, because a missing backup is exactly what this should catch.
  if (s.lastSuccess.queue && hoursSince(s.lastSuccess.queue, s.now) > ALERT_THRESHOLDS.queueStaleHours) {
    alerts.push({
      key: "queue-stale",
      title: "The queue worker has not run successfully for over a day",
      detail: "Check the cron setup (vercel.json and the GitHub “Scheduled tasks” workflow).",
    });
  }
  if (s.lastSuccess.daily && hoursSince(s.lastSuccess.daily, s.now) > ALERT_THRESHOLDS.dailyStaleHours) {
    alerts.push({
      key: "daily-stale",
      title: "The daily maintenance task has not run for over a day",
      detail: "Review reminders, metrics rollup and cleanup are not happening. Check Vercel → Cron Jobs.",
    });
  }
  if (hoursSince(s.lastSuccess.backup, s.now) > ALERT_THRESHOLDS.backupStaleHours) {
    alerts.push({
      key: "backup-stale",
      title: s.lastSuccess.backup
        ? "No successful backup for over a week"
        : "No backup has been recorded yet",
      detail: "Check the GitHub “Backup” workflow and its secrets. See the runbook: “Backups”.",
    });
  }
  return alerts;
}

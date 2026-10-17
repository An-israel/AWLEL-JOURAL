import "server-only";
import type { Database, Json } from "@/lib/supabase/database.types";
import { backoffDelayMs } from "@/lib/backoff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CIRCUIT_RETRY_MS, CircuitOpenError } from "./circuit-breaker";
import { EmailError, sendEmail, type EmailMessage } from "./email";
import { logger } from "./logger";
import { withSpan } from "./tracing";

/*
 * Background jobs (item 15). Work is written to the `jobs` table in the same
 * request that causes it, then attempted once immediately. If that attempt
 * fails, the job stays queued with a backoff delay and the queue worker
 * (cron, `drainQueue`) retries it; after max_attempts it moves to the dead
 * letter table (item 20). Claiming, failing and retry times are SQL
 * functions, so timestamps come from the database clock (item 96).
 */

type JobHandlers = {
  "email.send": EmailMessage;
};
export type JobType = keyof JobHandlers;

const handlers: { [K in JobType]: (payload: JobHandlers[K], idempotencyKey: string) => Promise<void> } = {
  "email.send": async (payload, key) => {
    await sendEmail(payload, key);
  },
};

export async function enqueueJob<K extends JobType>(
  type: K,
  payload: JobHandlers[K],
  idempotencyKey: string,
): Promise<number | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .upsert(
      {
        job_type: type,
        payload: payload as unknown as { [key: string]: Json },
        idempotency_key: idempotencyKey,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error({ err: error, type }, "could not enqueue job");
    return null;
  }
  return data?.id ?? null;
}

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * Everything is retried with backoff (timeouts, provider 5xx/429, deadlocks
 * and serialization failures, items 12 and 40) except errors that say a
 * retry can't help, such as a 4xx from the email provider.
 */
function isRetryable(error: unknown): boolean {
  return error instanceof EmailError ? error.retryable : true;
}

/** Runs a claimed job and records the outcome. Returns how it ended. */
async function execute(job: JobRow): Promise<"succeeded" | "retry" | "dead" | "deferred"> {
  const supabase = createSupabaseAdminClient();
  const handler = handlers[job.job_type as JobType] as
    ((payload: unknown, key: string) => Promise<void>) | undefined;
  try {
    if (!handler) throw new EmailError(`No handler for job type ${job.job_type}`, false);
    await withSpan(`job.${job.job_type}`, { "job.id": job.id, "job.attempt": job.attempts + 1 }, () =>
      handler(job.payload, job.idempotency_key ?? `job:${job.id}`),
    );
    await supabase.rpc("finish_job", { p_id: job.id });
    return "succeeded";
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // The provider is down: wait without using up an attempt.
      await supabase.rpc("defer_job", { p_id: job.id, p_retry_in_ms: CIRCUIT_RETRY_MS });
      return "deferred";
    }
    const message = error instanceof Error ? error.message : String(error);
    const { data: outcome } = await supabase.rpc("fail_job", {
      p_id: job.id,
      p_error: message,
      p_retryable: isRetryable(error),
      p_retry_in_ms: backoffDelayMs(job.attempts + 1),
    });
    const ended = outcome === "dead" ? "dead" : "retry";
    (ended === "dead" ? logger.error : logger.warn).call(
      logger,
      { jobId: job.id, type: job.job_type, attempts: job.attempts + 1, err: message },
      ended === "dead" ? "job moved to dead letters" : "job attempt failed; will retry",
    );
    return ended;
  }
}

/** Claims one queued job and runs it now. Safe to race with the worker. */
export async function runJobNow(jobId: number, worker = "inline"): Promise<boolean> {
  const { data } = await createSupabaseAdminClient().rpc("claim_job", { p_id: jobId, p_worker: worker });
  const job = data?.[0];
  if (!job) return false; // someone else has it, or it already ran
  return (await execute(job)) === "succeeded";
}

export interface DrainResult {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
  deferred: number;
  released: number;
}

/**
 * The queue worker (cron): releases jobs abandoned by a crashed worker, then
 * claims and runs ready jobs in small batches until the queue is empty or the
 * time budget is spent (backpressure, item 44).
 */
export async function drainQueue(worker: string, budgetMs = 45_000, batchSize = 10): Promise<DrainResult> {
  const supabase = createSupabaseAdminClient();
  const started = Date.now();
  const result: DrainResult = { claimed: 0, succeeded: 0, retried: 0, dead: 0, deferred: 0, released: 0 };
  const { data: released } = await supabase.rpc("release_stale_jobs", { p_older_than_seconds: 900 });
  result.released = released ?? 0;

  while (Date.now() - started < budgetMs) {
    const { data: jobs, error } = await supabase.rpc("claim_jobs", { p_worker: worker, p_limit: batchSize });
    if (error) throw new Error(`could not claim jobs: ${error.message}`);
    if (!jobs?.length) break;
    result.claimed += jobs.length;
    // One at a time: emails are rate limited by the provider anyway.
    for (const job of jobs) {
      const outcome = await execute(job);
      if (outcome === "succeeded") result.succeeded++;
      else if (outcome === "retry") result.retried++;
      else if (outcome === "dead") result.dead++;
      else result.deferred++;
    }
    if (jobs.length < batchSize) break;
  }
  return result;
}

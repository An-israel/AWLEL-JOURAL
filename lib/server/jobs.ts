import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { backoffDelayMs } from "@/lib/backoff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailError, sendEmail, type EmailMessage } from "./email";
import { logger } from "./logger";

/*
 * Background jobs (item 15). Work is written to the `jobs` table in the same
 * request that causes it, then attempted once immediately. If that attempt
 * fails, the job stays queued with a backoff delay and the queue worker
 * (milestone 8, cron) retries it; after max_attempts it moves to the dead
 * letter table (item 20). The worker in M8 moves the claim/fail steps into SQL
 * functions so their timestamps come from the database clock (item 96).
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

/** Claims one queued job and runs it now. Safe to race with the worker. */
export async function runJobNow(jobId: number, worker = "inline"): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase
    .from("jobs")
    .update({ status: "running", locked_at: new Date().toISOString(), locked_by: worker })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, job_type, payload, idempotency_key, attempts, max_attempts")
    .maybeSingle();
  if (!job) return false; // someone else has it, or it already ran

  const handler = handlers[job.job_type as JobType] as
    ((payload: unknown, key: string) => Promise<void>) | undefined;
  try {
    if (!handler) throw new Error(`No handler for job type ${job.job_type}`);
    await handler(job.payload, job.idempotency_key ?? `job:${job.id}`);
    await supabase
      .from("jobs")
      .update({ status: "succeeded", locked_at: null, last_error: null })
      .eq("id", job.id);
    return true;
  } catch (error) {
    const attempts = job.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    const permanent = error instanceof EmailError && !error.retryable;
    logger.warn({ jobId: job.id, type: job.job_type, attempts, err: message }, "job attempt failed");

    if (permanent || attempts >= job.max_attempts) {
      await supabase.from("dead_letter_jobs").insert({
        original_job_id: job.id,
        job_type: job.job_type,
        payload: job.payload,
        idempotency_key: job.idempotency_key,
        attempts,
        last_error: message,
      });
      await supabase.from("jobs").delete().eq("id", job.id);
    } else {
      await supabase
        .from("jobs")
        .update({
          status: "queued",
          attempts,
          last_error: message,
          locked_at: null,
          locked_by: null,
          run_at: new Date(Date.now() + backoffDelayMs(attempts)).toISOString(),
        })
        .eq("id", job.id);
    }
    return false;
  }
}

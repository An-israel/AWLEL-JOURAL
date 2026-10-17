import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "./logger";

/*
 * Circuit breaker (item 10), with its state in Postgres so every serverless
 * instance sees the same circuit (no module-level state, item 41). When a
 * provider keeps failing, callers stop calling it for a while and leave the
 * work queued; see the breaker_* functions in migration 10.
 */

export class CircuitOpenError extends Error {
  constructor(public readonly circuit: string) {
    super(`${circuit} is unavailable (circuit open); the work stays queued`);
    this.name = "CircuitOpenError";
  }
}

/** How long a deferred job waits before the circuit is tried again. */
export const CIRCUIT_RETRY_MS = 5 * 60 * 1000;

/**
 * Runs `fn` unless the circuit is open. `countsAsFailure` decides whether an
 * error is the provider's fault (e.g. a 5xx) rather than a bad request.
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  countsAsFailure: (error: unknown) => boolean = () => true,
): Promise<T> {
  const supabase = createSupabaseAdminClient();
  const { data: allowed } = await supabase.rpc("breaker_allows", { p_name: name });
  // If the breaker itself can't be read, let the call through.
  if (allowed === false) throw new CircuitOpenError(name);
  try {
    const result = await fn();
    await supabase.rpc("breaker_record", { p_name: name, p_ok: true });
    return result;
  } catch (error) {
    if (countsAsFailure(error)) {
      const { error: recordError } = await supabase.rpc("breaker_record", { p_name: name, p_ok: false });
      if (recordError) logger.warn({ err: recordError, circuit: name }, "could not record circuit failure");
    }
    throw error;
  }
}

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withTimeout } from "./timeout";

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function timed(label: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withTimeout(fn(), 3_000, label);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

/** Dependency checks for readiness (items 56, 57). */
export async function checkDependencies() {
  const supabase = createSupabaseAdminClient();
  const [database, storage] = await Promise.all([
    timed("database", async () => {
      const { error } = await supabase.from("site_settings").select("id").limit(1);
      if (error) throw new Error(error.message);
    }),
    timed("storage", async () => {
      const { error } = await supabase.storage.getBucket("issue-covers");
      if (error) throw new Error(error.message);
    }),
  ]);
  return { ok: database.ok && storage.ok, checks: { database, storage } };
}

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Counts one server error for the error-rate alert (items 61, 62). Best
 * effort and never throws: reporting an error must not cause another.
 */
export async function countServerError(): Promise<void> {
  try {
    await createSupabaseAdminClient().rpc("record_app_error");
  } catch {
    // The database may be the thing that is failing; the log line still exists.
  }
}

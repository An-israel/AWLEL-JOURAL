import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { fetchWithTimeout } from "@/lib/server/timeout";
import type { Database } from "./database.types";

/**
 * Service-role client: BYPASSES RLS. Only for server code that has already
 * checked the caller's role, or for system work (queue, metrics, contact
 * form inserts). Never pass its results to the client unfiltered.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout() },
  });
}

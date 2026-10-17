import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env.public";
import { fetchWithTimeout } from "@/lib/server/timeout";
import type { Database } from "./database.types";

/**
 * Anonymous, cookie-less client for public data. Safe inside `"use cache"`
 * because it carries no user identity: RLS shows only published content.
 */
export function createSupabasePublicClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout() },
  });
}

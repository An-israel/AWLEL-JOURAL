"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env.public";
import type { Database } from "./database.types";

/** Supabase client for client components (signed-in user's session, RLS applies). */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

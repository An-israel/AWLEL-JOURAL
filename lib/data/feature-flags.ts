import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const FLAGS_TAG = "feature-flags";

/** Feature flags (item 51). Unknown or unreachable flags read as off. */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  "use cache";
  cacheTag(FLAGS_TAG);
  cacheLife("hours");
  const { data } = await createSupabasePublicClient().from("feature_flags").select("key, enabled");
  return Object.fromEntries((data ?? []).map((f) => [f.key, f.enabled]));
}

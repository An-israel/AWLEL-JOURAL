import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/server/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getCategoriesWithCounts, getPublishedIssues } from "./catalog";
import { TAGS } from "./tags";

/*
 * Old addresses that keep working (items 74, 81). The database records the
 * old numbers of a renumbered live issue and the old slug of a renamed
 * category; the public pages ask here before showing "not found".
 */

const NUMBER = /^\d{1,4}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The current address of a published issue that used to be at
 * /issues/{volume}/{issue}, or null. Takes the raw route values.
 */
export async function findIssueRedirect(volume: string, issue: string): Promise<string | null> {
  "use cache";
  cacheTag(TAGS.issues);
  if (!NUMBER.test(volume) || !NUMBER.test(issue)) return null;
  const { data, error } = await createSupabasePublicClient()
    .from("issue_redirects")
    .select("issue_id")
    .eq("volume_number", Number(volume))
    .eq("issue_number", Number(issue))
    .maybeSingle();
  if (error) {
    logger.warn({ err: error }, "redirects: issue lookup failed");
    cacheLife("minutes");
    return null;
  }
  cacheLife("days");
  if (!data) return null;
  const target = (await getPublishedIssues()).find((i) => i.id === data.issue_id);
  return target && target.path !== `/issues/${Number(volume)}/${Number(issue)}` ? target.path : null;
}

/** The current slug of a category that used to be at /categories/{slug}, or null. */
export async function findCategoryRedirect(slug: string): Promise<string | null> {
  "use cache";
  cacheTag(TAGS.categories);
  if (!SLUG.test(slug)) return null;
  const { data, error } = await createSupabasePublicClient()
    .from("category_redirects")
    .select("category_id")
    .eq("old_slug", slug)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error }, "redirects: category lookup failed");
    cacheLife("minutes");
    return null;
  }
  cacheLife("days");
  if (!data) return null;
  // Only categories still listed on the site (archived ones are not).
  const target = (await getCategoriesWithCounts()).find((c) => c.id === data.category_id);
  return target && target.slug !== slug ? target.slug : null;
}

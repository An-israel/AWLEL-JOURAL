import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/server/logger";
import { SITE_DEFAULTS } from "@/lib/site";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { TAGS } from "./tags";

export interface SiteSettings {
  journalName: string;
  shortName: string;
  subtitle: string;
  issn: string;
  publisher: string;
  contactEmail: string;
  postalAddress: string;
  socialLinks: Record<string, string>;
}

const FALLBACK: SiteSettings = { ...SITE_DEFAULTS, socialLinks: {} };

/** Journal details from the database, cached until Settings are saved. */
export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheTag(TAGS.siteSettings);

  const { data, error } = await createSupabasePublicClient()
    .from("site_settings")
    .select(
      "journal_name, journal_short_name, subtitle, issn, publisher, contact_email, postal_address, social_links",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    // Serve the built-in details rather than failing the page (item 95).
    logger.warn({ err: error }, "site settings unavailable; using defaults");
    cacheLife("minutes"); // retry soon instead of pinning the fallback
    return FALLBACK;
  }

  cacheLife("days");
  return {
    journalName: data.journal_name,
    shortName: data.journal_short_name,
    subtitle: data.subtitle,
    issn: data.issn,
    publisher: data.publisher,
    contactEmail: data.contact_email,
    postalAddress: data.postal_address ?? SITE_DEFAULTS.postalAddress,
    socialLinks: (data.social_links ?? {}) as Record<string, string>,
  };
}

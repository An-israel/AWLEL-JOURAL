import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_DEFAULTS, withHomeDefaults, type HomeContent } from "@/lib/home-content";
import { logger } from "@/lib/server/logger";
import { SITE_DEFAULTS } from "@/lib/site";
import { publicStorageUrl } from "@/lib/storage";
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
  logoUrl: string | null;
  ogImageUrl: string | null;
  /** The articles' licence, once confirmed in Settings; null shows nothing. */
  licence: { name: string; url: string | null } | null;
  /** The home page's wording (Admin → Home page), over the original wording. */
  home: HomeContent;
}

const FALLBACK: SiteSettings = {
  ...SITE_DEFAULTS,
  socialLinks: {},
  logoUrl: null,
  ogImageUrl: null,
  licence: null,
  home: HOME_DEFAULTS,
};

/** Journal details from the database, cached until Settings are saved. */
export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheTag(TAGS.siteSettings);

  const supabase = createSupabasePublicClient();
  const base =
    "journal_name, journal_short_name, subtitle, issn, publisher, contact_email, postal_address, license_name, license_url, social_links, logo:stored_files!site_settings_logo_file_id_fkey(path), og:stored_files!site_settings_default_og_image_file_id_fkey(path)" as const;
  let { data, error } = await supabase
    .from("site_settings")
    .select(`${base}, home_content`)
    .eq("id", 1)
    .maybeSingle();
  // Before the setup SQL has added home_content (migration 19), keep the
  // real details and use the original home page wording.
  if (error?.code === "42703") {
    const older = await supabase.from("site_settings").select(base).eq("id", 1).maybeSingle();
    ({ error } = older);
    data = older.data ? { ...older.data, home_content: {} } : null;
  }

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
    logoUrl: data.logo ? publicStorageUrl("site-assets", data.logo.path) : null,
    ogImageUrl: data.og ? publicStorageUrl("site-assets", data.og.path) : null,
    licence: data.license_name ? { name: data.license_name, url: data.license_url } : null,
    home: withHomeDefaults(data.home_content),
  };
}

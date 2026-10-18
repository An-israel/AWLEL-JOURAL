"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { featureName } from "@/lib/admin/feature-names";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { FLAGS_TAG } from "@/lib/data/feature-flags";
import { TAGS } from "@/lib/data/tags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUPER = ["super_admin"] as const;
const url = z.union([z.literal(""), z.url("Enter a full address starting with https://").max(300)]);

const settingsSchema = z.object({
  expectedVersion: z.number().int(),
  // Plain-English messages for every field (item 86).
  journalName: z
    .string("Enter the journal's name.")
    .trim()
    .min(3, "Enter the journal's name (at least 3 characters).")
    .max(200, "Keep the journal's name under 200 characters."),
  shortName: z
    .string("Enter a short name.")
    .trim()
    .min(2, "Enter a short name of at least 2 characters, e.g. AWLEL.")
    .max(20, "Keep the short name to 20 characters or fewer."),
  subtitle: z
    .string("Enter a subtitle.")
    .trim()
    .min(3, "Enter a subtitle (at least 3 characters).")
    .max(300, "Keep the subtitle under 300 characters."),
  issn: z
    .string("Enter the ISSN.")
    .trim()
    .regex(/^\d{4}-\d{3}[\dX]$/, "ISSN format is 1234-567X."),
  publisher: z
    .string("Enter the publisher.")
    .trim()
    .min(3, "Enter the publisher's name (at least 3 characters).")
    .max(300, "Keep the publisher's name under 300 characters."),
  contactEmail: z.email("Enter a valid email address."),
  postalAddress: z.string().trim().max(500, "Keep the postal address under 500 characters.").optional(),
  publicationFrequency: z
    .string()
    .trim()
    .max(200, "Keep the publication frequency under 200 characters.")
    .optional(),
  social: z.object({ x: url, facebook: url, linkedin: url, website: url }),
});

export async function saveSettings(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult<{ version: number }>> {
  const user = await userWithRole(SUPER);
  if (!user) return forbiddenResult;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .update({
      journal_name: s.journalName,
      journal_short_name: s.shortName,
      subtitle: s.subtitle,
      issn: s.issn,
      publisher: s.publisher,
      contact_email: s.contactEmail,
      postal_address: s.postalAddress || null,
      publication_frequency: s.publicationFrequency || null,
      social_links: Object.fromEntries(Object.entries(s.social).filter(([, v]) => v)),
      updated_by: user.id,
    })
    .eq("id", 1)
    .eq("version", s.expectedVersion)
    .select("version")
    .maybeSingle();
  if (error) return fromDbError(error, "settings");
  if (!data) return fromDbError({ code: "AW409", message: "" });
  updateTag(TAGS.siteSettings);
  return {
    ok: true,
    message: "Settings saved. The site shows them straight away.",
    data: { version: data.version },
  };
}

export async function setFeatureFlag(input: { key: string; enabled: boolean }): Promise<ActionResult> {
  const user = await userWithRole(SUPER);
  if (!user) return forbiddenResult;
  const parsed = z
    .object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/), enabled: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ enabled: parsed.data.enabled, updated_by: user.id })
    .eq("key", parsed.data.key)
    .select("key")
    .maybeSingle();
  if (error) return fromDbError(error, "setting");
  if (!data) return { ok: false, message: "Unknown feature." };
  updateTag(FLAGS_TAG);
  return {
    ok: true,
    message: `${featureName(parsed.data.key)} turned ${parsed.data.enabled ? "on" : "off"}.`,
  };
}

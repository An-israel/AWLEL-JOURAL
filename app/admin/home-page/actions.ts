"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { TAGS } from "@/lib/data/tags";
import { homeContentSchema, withHomeDefaults, type HomeContent } from "@/lib/home-content";
import { sanitizeRichText } from "@/lib/sanitize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({ expectedVersion: z.number().int(), content: homeContentSchema });

/** Saves the home page's wording; the home page shows it straight away. */
export async function saveHomeContent(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ version: number }>> {
  const user = await userWithRole(["super_admin"]);
  if (!user) return forbiddenResult;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { expectedVersion, content } = parsed.data;
  const clean = { ...content, about: { ...content.about, body: sanitizeRichText(content.about.body) } };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .update({ home_content: clean, updated_by: user.id })
    .eq("id", 1)
    .eq("version", expectedVersion)
    .select("version")
    .maybeSingle();
  if (error) return fromDbError(error, "home page");
  if (!data) return fromDbError({ code: "AW409", message: "" });
  updateTag(TAGS.siteSettings);
  return {
    ok: true,
    message: "Home page saved. It shows the new wording straight away.",
    data: { version: data.version },
  };
}

/**
 * What the home page's "Edit this page" mode starts from: the stored wording
 * and its version, for Super Admins only (null for everyone else).
 */
export async function loadHomeForEditing(): Promise<{ version: number; content: HomeContent } | null> {
  const user = await userWithRole(["super_admin"]);
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("version, home_content")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return { version: data.version, content: withHomeDefaults(data.home_content) };
}

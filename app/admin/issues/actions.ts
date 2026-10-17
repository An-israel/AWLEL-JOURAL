"use server";

import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import { sanitizeRichText } from "@/lib/sanitize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;
const conflict = () => fromDbError({ code: "AW409", message: "" });

const volumeSchema = z.object({
  volumeNumber: z.coerce.number().int().min(1, "Volume numbers start at 1.").max(9999),
  year: z.coerce.number().int().min(1990, "Enter a year from 1990.").max(2200),
});

/** Volume number and year are entered separately: older years may not follow the pattern. */
export async function createVolume(
  input: z.input<typeof volumeSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = volumeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("volumes")
    .insert({ volume_number: parsed.data.volumeNumber, year: parsed.data.year })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          message: `Volume ${parsed.data.volumeNumber} already exists.`,
          fieldErrors: { volumeNumber: "Already exists" },
        }
      : fromDbError(error, "volume");
  }
  return { ok: true, message: `Volume ${parsed.data.volumeNumber} created.`, data: { id: data.id } };
}

export async function deleteVolume(id: string): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("volume_id", id);
  if (count)
    return { ok: false, message: "Only an empty volume can be deleted. Move or delete its issues first." };
  const { error } = await supabase.from("volumes").delete().eq("id", id);
  if (error) return fromDbError(error, "volume");
  return { ok: true, message: "Volume deleted." };
}

const issueCreateSchema = z.object({
  volumeId: z.uuid(),
  issueNumber: z.coerce.number().int().min(1).max(99),
  month: z.coerce.number().int().min(1).max(12).optional(),
  legacyNumber: z.coerce.number().int().min(1).max(9999).optional(),
});

export async function createIssue(
  input: z.input<typeof issueCreateSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = issueCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("issues")
    .insert({
      volume_id: parsed.data.volumeId,
      issue_number: parsed.data.issueNumber,
      month: parsed.data.month ?? null,
      legacy_number: parsed.data.legacyNumber ?? null,
    })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          message: `Issue ${parsed.data.issueNumber} already exists in this volume.`,
          fieldErrors: { issueNumber: "Already exists" },
        }
      : fromDbError(error, "issue");
  }
  return { ok: true, message: "Draft issue created.", data: { id: data.id } };
}

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(min).max(max).nullable(),
  );

const issueSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.number().int(),
  issueNumber: z.coerce.number().int().min(1).max(99),
  month: optionalInt(1, 12),
  legacyNumber: optionalInt(1, 9999),
  title: z.string().trim().max(300).optional(),
  editorial: z.string().max(100_000).optional(),
  coverAlt: z.string().trim().max(300).optional(),
  publishedAt: z.union([z.literal(""), z.iso.date()]).optional(),
});

export async function saveIssue(
  input: z.input<typeof issueSchema>,
): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("issues")
    .update({
      issue_number: d.issueNumber,
      month: d.month,
      legacy_number: d.legacyNumber,
      title: d.title || null,
      editorial: sanitizeRichText(d.editorial) || null,
      cover_alt: d.coverAlt || null,
      published_at: d.publishedAt ? `${d.publishedAt}T09:00:00Z` : null,
    })
    .eq("id", d.id)
    .eq("version", d.expectedVersion)
    .select("version")
    .maybeSingle();
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          message: "Another issue in this volume already has that number.",
          fieldErrors: { issueNumber: "Already used" },
        }
      : fromDbError(error, "issue");
  }
  if (!data) return conflict();
  expireCatalog({ issueIds: [d.id] });
  return { ok: true, message: "Issue saved.", data: { version: data.version } };
}

export async function setIssueStatus(input: {
  id: string;
  expectedVersion: number;
  status: "draft" | "published";
  includeArticles?: boolean;
}): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({
      id: z.uuid(),
      expectedVersion: z.number().int(),
      status: z.enum(["draft", "published"]),
      includeArticles: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_issue_status", {
    p_issue_id: parsed.data.id,
    p_expected_version: parsed.data.expectedVersion,
    p_status: parsed.data.status,
    p_include_articles: parsed.data.includeArticles ?? false,
  });
  if (error) return fromDbError(error, "issue");
  const { data: articles } = await supabase.from("articles").select("id").eq("issue_id", parsed.data.id);
  expireCatalog({
    issueIds: [parsed.data.id],
    articleIds: (articles ?? []).map((a) => a.id),
    categories: true,
  });
  return {
    ok: true,
    message:
      parsed.data.status === "published"
        ? "Issue published. It's now live on the site."
        : "Issue unpublished. It's hidden from the site.",
    data: { version: data },
  };
}

export async function setIssueDeleted(input: {
  id: string;
  expectedVersion: number;
  deleted: boolean;
}): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({ id: z.uuid(), expectedVersion: z.number().int(), deleted: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("issues")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
      ...(parsed.data.deleted ? { status: "draft" as const } : {}),
    })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .select("version")
    .maybeSingle();
  if (error) return fromDbError(error, "issue");
  if (!data) return conflict();
  expireCatalog({ issueIds: [parsed.data.id], categories: true });
  return {
    ok: true,
    message: parsed.data.deleted ? "Issue moved to trash. You can restore it." : "Issue restored as a draft.",
    data: { version: data.version },
  };
}

export async function reorderIssueArticles(input: { issueId: string; ids: string[] }): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z.object({ issueId: z.uuid(), ids: z.array(z.uuid()).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid order." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_rows", { p_table: "articles", p_ids: parsed.data.ids });
  if (error) return fromDbError(error, "article");
  expireCatalog({ issueIds: [parsed.data.issueId] });
  return { ok: true, message: "Article order saved." };
}

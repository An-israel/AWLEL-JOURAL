"use server";

import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import { sanitizeRichText } from "@/lib/sanitize";
import { notifyPublishedSubmissions } from "@/lib/submissions/published";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;
const conflict = () => fromDbError({ code: "AW409", message: "" });

const volumeSchema = z.object({
  volumeNumber: z.coerce
    .number("Enter the volume number.")
    .int("Use a whole number.")
    .min(1, "Volume numbers start at 1.")
    .max(9999, "Use a number up to 9999."),
  year: z.coerce
    .number("Enter the year.")
    .int("Enter a year such as 2025.")
    .min(1990, "Enter a year from 1990.")
    .max(2200, "Enter a year before 2200."),
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

const volumeUpdateSchema = volumeSchema.extend({ id: z.uuid(), expectedVersion: z.number().int() });

/** Changes a volume's number or year (item 73). Live issues keep their old addresses (item 74). */
export async function updateVolume(input: z.input<typeof volumeUpdateSchema>): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = volumeUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("volumes")
    .update({ volume_number: parsed.data.volumeNumber, year: parsed.data.year })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .select("id")
    .maybeSingle();
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          message: `There is already a Volume ${parsed.data.volumeNumber}.`,
          fieldErrors: { volumeNumber: "Already exists" },
        }
      : fromDbError(error, "volume");
  }
  if (!data) return conflict();
  expireCatalog({ categories: true });
  return { ok: true, message: `Volume ${parsed.data.volumeNumber} saved.` };
}

/** Only a volume with no issues at all (trashed ones included) can be deleted. */
export async function deleteVolume(id: string): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("volume_id", id);
  if (count)
    return {
      ok: false,
      message:
        "Only an empty volume can be deleted. Delete its issues forever first (issues in the trash count too).",
    };
  const { error } = await supabase.from("volumes").delete().eq("id", id);
  if (error) return fromDbError(error, "volume");
  expireCatalog();
  return { ok: true, message: "Volume deleted." };
}

/**
 * The "number already used" message. A trashed issue still holds its number,
 * so say so, and how to free it (item 73).
 */
async function numberTakenMessage(volumeId: string, issueNumber: number, exceptId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("issues")
    .select("deleted_at")
    .eq("volume_id", volumeId)
    .eq("issue_number", issueNumber);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.maybeSingle();
  return data?.deleted_at
    ? `Issue ${issueNumber} already exists in this volume (it's in the trash — restore it or delete it forever).`
    : `Issue ${issueNumber} already exists in this volume.`;
}

const issueNumber = z.coerce
  .number("Enter the issue number.")
  .int("Use a whole number.")
  .min(1, "Issue numbers start at 1.")
  .max(99, "Use a number up to 99.");

const issueCreateSchema = z.object({
  volumeId: z.uuid(),
  issueNumber,
  month: z.coerce.number().int().min(1, "Choose a month.").max(12, "Choose a month.").optional(),
  legacyNumber: z.coerce
    .number("Enter a number, or leave it empty.")
    .int("Use a whole number.")
    .min(1, "Use a number from 1.")
    .max(9999, "Use a number up to 9999.")
    .optional(),
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
          message: await numberTakenMessage(parsed.data.volumeId, parsed.data.issueNumber),
          fieldErrors: { issueNumber: "Already exists" },
        }
      : fromDbError(error, "issue");
  }
  return { ok: true, message: "Draft issue created.", data: { id: data.id } };
}

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number("Enter a number, or leave it empty.")
      .int("Use a whole number.")
      .min(min, `Use a number from ${min}.`)
      .max(max, `Use a number up to ${max}.`)
      .nullable(),
  );

const issueSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.number().int(),
  issueNumber,
  month: optionalInt(1, 12),
  legacyNumber: optionalInt(1, 9999),
  title: z.string().trim().max(300, "Keep the title under 300 characters.").optional(),
  editorial: z.string().max(100_000, "The editorial is too long.").optional(),
  coverAlt: z.string().trim().max(300, "Keep the cover description under 300 characters.").optional(),
  publishedAt: z.union([z.literal(""), z.iso.date("Choose a date.")]).optional(),
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
      // A published issue keeps its date when this is empty (trigger, item 68),
      // and a renumbered live issue keeps its old address (trigger, item 74).
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
    if (error.code !== "23505") return fromDbError(error, "issue");
    const { data: current } = await supabase.from("issues").select("volume_id").eq("id", d.id).maybeSingle();
    return {
      ok: false,
      message: current
        ? await numberTakenMessage(current.volume_id, d.issueNumber, d.id)
        : "Another issue in this volume already has that number.",
      fieldErrors: { issueNumber: "Already used" },
    };
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
  /** Publishing an issue with no articles needs this explicit confirmation (item 69). */
  allowEmpty?: boolean;
}): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({
      id: z.uuid(),
      expectedVersion: z.number().int(),
      status: z.enum(["draft", "published"]),
      includeArticles: z.boolean().optional(),
      allowEmpty: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  if (parsed.data.status === "published" && !parsed.data.allowEmpty) {
    const { count } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("issue_id", parsed.data.id)
      .is("deleted_at", null);
    if (!count)
      return {
        ok: false,
        message:
          "This issue has no articles. Tick “Publish it anyway” if you really want to publish it empty.",
      };
  }
  const { data, error } = await supabase.rpc("set_issue_status", {
    p_issue_id: parsed.data.id,
    p_expected_version: parsed.data.expectedVersion,
    p_status: parsed.data.status,
    p_include_articles: parsed.data.includeArticles ?? false,
  });
  if (error) return fromDbError(error, "issue");
  if (parsed.data.status === "published") await notifyPublishedSubmissions();
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

/** Deletes a trashed issue for good, with its trashed articles (Super Admin, item 73). */
export async function deleteIssueForever(id: string): Promise<ActionResult> {
  if (!(await userWithRole(["super_admin"]))) return forbiddenResult;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_issue_forever", { p_issue_id: id });
  if (error) {
    return error.code === "AW422" ? { ok: false, message: error.message } : fromDbError(error, "issue");
  }
  expireCatalog({ issueIds: [id], categories: true });
  return { ok: true, message: "Issue deleted forever. Its number is free again." };
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

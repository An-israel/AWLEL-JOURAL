"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { TAG_DEPARTMENT_TIMELINE, TAGS } from "@/lib/data/tags";
import { sanitizeRichText } from "@/lib/sanitize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUPER = ["super_admin"] as const;

const pageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  expectedVersion: z.number().int(),
  title: z.string().trim().min(2, "Enter a title.").max(200),
  metaDescription: z.string().trim().max(300, "Keep it under 300 characters.").optional(),
  content: z.string().max(300_000),
  needsReview: z.boolean(),
});

export async function savePage(
  input: z.input<typeof pageSchema>,
): Promise<ActionResult<{ version: number }>> {
  const user = await userWithRole(SUPER);
  if (!user) return forbiddenResult;
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pages")
    .update({
      title: p.title,
      meta_description: p.metaDescription || null,
      content: sanitizeRichText(p.content),
      needs_review: p.needsReview,
      updated_by: user.id,
    })
    .eq("slug", p.slug)
    .eq("version", p.expectedVersion)
    .select("version")
    .maybeSingle();
  if (error) return fromDbError(error, "page");
  if (!data) return fromDbError({ code: "AW409", message: "" });
  updateTag(TAGS.pages);
  updateTag(TAGS.page(p.slug));
  return { ok: true, message: "Page saved and published.", data: { version: data.version } };
}

const milestoneSchema = z.object({
  id: z.uuid().optional(),
  expectedVersion: z.number().int().optional(),
  yearLabel: z.string().trim().min(1, "Enter a year or period.").max(40),
  title: z.string().trim().min(2, "Enter a title.").max(200),
  description: z.string().trim().max(1000).optional(),
  needsVerification: z.boolean(),
});

export async function saveMilestone(
  input: z.input<typeof milestoneSchema>,
): Promise<ActionResult<{ id: string; version: number }>> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const m = parsed.data;
  const supabase = await createSupabaseServerClient();
  const values = {
    year_label: m.yearLabel,
    title: m.title,
    description: m.description || null,
    needs_verification: m.needsVerification,
  };
  const result = m.id
    ? await supabase
        .from("department_milestones")
        .update(values)
        .eq("id", m.id)
        .eq("version", m.expectedVersion ?? -1)
        .select("id, version")
        .maybeSingle()
    : await supabase
        .from("department_milestones")
        .insert({ ...values, sort_order: 10_000 })
        .select("id, version")
        .single();
  if (result.error) return fromDbError(result.error, "milestone");
  if (!result.data) return fromDbError({ code: "AW409", message: "" });
  updateTag(TAG_DEPARTMENT_TIMELINE);
  return { ok: true, message: "Milestone saved.", data: result.data };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("department_milestones").delete().eq("id", id);
  if (error) return fromDbError(error, "milestone");
  updateTag(TAG_DEPARTMENT_TIMELINE);
  return { ok: true, message: "Milestone removed." };
}

export async function reorderMilestones(ids: string[]): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = z.array(z.uuid()).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Invalid order." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_rows", {
    p_table: "department_milestones",
    p_ids: parsed.data,
  });
  if (error) return fromDbError(error, "milestone");
  updateTag(TAG_DEPARTMENT_TIMELINE);
  return { ok: true, message: "Order saved." };
}

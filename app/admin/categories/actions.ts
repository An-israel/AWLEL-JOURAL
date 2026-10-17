"use server";

import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;

const categorySchema = z.object({
  id: z.uuid().optional(),
  expectedVersion: z.number().int().optional(),
  name: z.string().trim().min(2, "Enter a name.").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
  description: z.string().trim().max(600).optional(),
});

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, expectedVersion, name, slug, description } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const values = { name, slug, description: description || null };

  if (id) {
    const { data, error } = await supabase
      .from("categories")
      .update(values)
      .eq("id", id)
      .eq("version", expectedVersion ?? -1)
      .select("id")
      .maybeSingle();
    if (error) return fromDbError(error, "category");
    if (!data) return fromDbError({ code: "AW409", message: "" });
  } else {
    const { data: last } = await supabase
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("categories")
      .insert({ ...values, sort_order: (last?.sort_order ?? 0) + 10 });
    if (error) return fromDbError(error, "category");
  }
  expireCatalog({ categories: true });
  return { ok: true, message: id ? "Category saved." : "Category created." };
}

export async function setCategoryArchived(input: {
  id: string;
  archived: boolean;
  expectedVersion: number;
}): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({ id: z.uuid(), archived: z.boolean(), expectedVersion: z.number().int() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ is_archived: parsed.data.archived })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .select("id")
    .maybeSingle();
  if (error) return fromDbError(error, "category");
  if (!data) return fromDbError({ code: "AW409", message: "" });
  expireCatalog({ categories: true });
  return {
    ok: true,
    message: parsed.data.archived
      ? "Category archived. Its articles keep it, but it's hidden from new articles and the category grid."
      : "Category restored.",
  };
}

export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z.array(z.uuid()).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Invalid order." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_rows", { p_table: "categories", p_ids: parsed.data });
  if (error) return fromDbError(error, "category");
  expireCatalog({ categories: true });
  return { ok: true, message: "Order saved." };
}

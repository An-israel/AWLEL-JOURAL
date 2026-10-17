"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { TAGS } from "@/lib/data/tags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUPER = ["super_admin"] as const;
const done = (message: string): ActionResult => {
  updateTag(TAGS.board);
  return { ok: true, message };
};

export async function saveGroup(input: {
  id?: string;
  expectedVersion?: number;
  name: string;
}): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = z
    .object({
      id: z.uuid().optional(),
      expectedVersion: z.number().int().optional(),
      name: z.string().trim().min(2, "Enter a name.").max(120),
    })
    .safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("editorial_board_groups")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .eq("version", parsed.data.expectedVersion ?? -1)
      .select("id")
      .maybeSingle();
    if (error) return fromDbError(error, "group");
    if (!data) return fromDbError({ code: "AW409", message: "" });
  } else {
    const { error } = await supabase
      .from("editorial_board_groups")
      .insert({ name: parsed.data.name, sort_order: 10_000 });
    if (error) return fromDbError(error, "group");
  }
  return done("Group saved.");
}

export async function reorderBoard(input: {
  table: "editorial_board_groups" | "editorial_board_members";
  ids: string[];
}): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = z
    .object({
      table: z.enum(["editorial_board_groups", "editorial_board_members"]),
      ids: z.array(z.uuid()).max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid order." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_rows", {
    p_table: parsed.data.table,
    p_ids: parsed.data.ids,
  });
  if (error) return fromDbError(error, "board");
  return done("Order saved.");
}

const memberSchema = z.object({
  id: z.uuid().optional(),
  expectedVersion: z.number().int().optional(),
  groupId: z.uuid("Choose a group."),
  name: z.string().trim().min(2, "Enter the name.").max(200),
  title: z.string().trim().max(200).optional(),
  affiliation: z.string().trim().max(400).optional(),
  needsVerification: z.boolean(),
});

export async function saveMember(
  input: z.input<typeof memberSchema>,
): Promise<ActionResult<{ id: string; version: number }>> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const m = parsed.data;
  const values = {
    group_id: m.groupId,
    name: m.name,
    title: m.title || null,
    affiliation: m.affiliation || null,
    needs_verification: m.needsVerification,
  };
  const supabase = await createSupabaseServerClient();
  const result = m.id
    ? await supabase
        .from("editorial_board_members")
        .update(values)
        .eq("id", m.id)
        .eq("version", m.expectedVersion ?? -1)
        .select("id, version")
        .maybeSingle()
    : await supabase
        .from("editorial_board_members")
        .insert({ ...values, sort_order: 10_000 })
        .select("id, version")
        .single();
  if (result.error) return fromDbError(result.error, "member");
  if (!result.data) return fromDbError({ code: "AW409", message: "" });
  updateTag(TAGS.board);
  return { ok: true, message: m.id ? "Member saved." : "Member added.", data: result.data };
}

export async function setMemberDeleted(input: {
  id: string;
  expectedVersion: number;
  deleted: boolean;
}): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = z
    .object({ id: z.uuid(), expectedVersion: z.number().int(), deleted: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("editorial_board_members")
    .update({ deleted_at: parsed.data.deleted ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .select("id")
    .maybeSingle();
  if (error) return fromDbError(error, "member");
  if (!data) return fromDbError({ code: "AW409", message: "" });
  return done(
    parsed.data.deleted ? "Member removed from the board. You can restore them." : "Member restored.",
  );
}

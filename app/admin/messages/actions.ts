"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, type ActionResult } from "@/lib/admin/result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;

export async function updateMessage(input: {
  id: string;
  isRead?: boolean;
  deleted?: boolean;
}): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({ id: z.uuid(), isRead: z.boolean().optional(), deleted: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const patch: { is_read?: boolean; deleted_at?: string | null } = {};
  if (parsed.data.isRead !== undefined) patch.is_read = parsed.data.isRead;
  if (parsed.data.deleted !== undefined)
    patch.deleted_at = parsed.data.deleted ? new Date().toISOString() : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("contact_messages").update(patch).eq("id", parsed.data.id);
  if (error) return fromDbError(error, "message");
  revalidatePath("/admin/messages");
  return {
    ok: true,
    message:
      parsed.data.deleted === true
        ? "Message moved to trash."
        : parsed.data.deleted === false
          ? "Message restored."
          : parsed.data.isRead
            ? "Marked as read."
            : "Marked as unread.",
  };
}

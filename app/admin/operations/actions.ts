"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromDbError, forbiddenResult, type ActionResult } from "@/lib/admin/result";
import { userWithRole } from "@/lib/auth";
import { runTask, TASKS } from "@/lib/server/cron";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUPER = ["super_admin"] as const;

/** "Run now" for one scheduled task. */
export async function runTaskNow(task: string): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  const parsed = z.enum(TASKS).safeParse(task);
  if (!parsed.success) return { ok: false, message: "Unknown task." };
  const report = await runTask(parsed.data);
  revalidatePath("/admin/operations");
  if (report.status === "skipped")
    return { ok: false, message: "That task is already running. Try again shortly." };
  if (report.status === "failed") return { ok: false, message: `The task failed: ${report.error}` };
  return { ok: true, message: `Done: ${summarise(report.detail)}` };
}

function summarise(detail: Record<string, unknown>): string {
  const parts = Object.entries(detail)
    .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || Array.isArray(v))
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${Array.isArray(v) ? v.length : v}`);
  return parts.join(", ") || "nothing to do";
}

export async function resolveDeadLetter(id: number, action: "retried" | "discarded"): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  if (!Number.isInteger(id) || !["retried", "discarded"].includes(action))
    return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_dead_letter", { p_id: id, p_action: action });
  if (error) return fromDbError(error, "job");
  revalidatePath("/admin/operations");
  return {
    ok: true,
    message: action === "retried" ? "Sent back to the queue. It runs within 30 minutes." : "Discarded.",
  };
}

export async function removeSuppression(email: string): Promise<ActionResult> {
  if (!(await userWithRole(SUPER))) return forbiddenResult;
  if (!z.email().safeParse(email).success) return { ok: false, message: "Invalid email." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("email_suppressions").delete().eq("email", email.toLowerCase());
  if (error) return fromDbError(error, "address");
  revalidatePath("/admin/operations");
  return { ok: true, message: `${email} will receive emails again.` };
}

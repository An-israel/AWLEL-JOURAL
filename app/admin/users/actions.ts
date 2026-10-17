"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { siteUrl } from "@/lib/env.public";
import { ROLES } from "@/lib/roles";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Users and Roles (section 6): Super Admin only. Each action checks the role
 * on the server; the change itself runs as the signed-in Super Admin so RLS
 * applies and the audit log records who did it. The database refuses to
 * demote, deactivate or delete the last active Super Admin.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const SUPER = ["super_admin"] as const;

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "P0001" || error.message.includes("at least one active Super Admin")) {
    return "There must always be at least one active Super Admin. Promote someone else first.";
  }
  if (error.code === "42501") return "You don't have permission to do that.";
  return "Something went wrong. Please try again.";
}

const inviteSchema = z.object({
  email: z.email("Enter a valid email address."),
  fullName: z.string().trim().min(2, "Enter the person's name.").max(200),
  role: z.enum(ROLES),
});

export interface InviteState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function inviteUser(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const actor = await userWithRole(SUPER);
  if (!actor) return { status: "error", message: "Only a Super Admin can invite users." };

  const parsed = inviteSchema.safeParse({
    email: fd.get("email"),
    fullName: fd.get("fullName"),
    role: fd.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", fieldErrors };
  }
  const { email, fullName, role } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "");
    if (!exists) logger.error({ code: error?.code }, "invite failed");
    return {
      status: "error",
      message: exists
        ? "Someone with this email already has an account. Change their role in the table instead."
        : "The invitation could not be sent. Please try again.",
    };
  }

  // Keep the JWT's app_metadata in step, then set the role as the Super Admin
  // (so the audit log records who granted it).
  await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role } });
  if (role !== "author") {
    const supabase = await createSupabaseServerClient();
    const { error: roleError } = await supabase.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) {
      logger.error({ err: roleError }, "invite: role update failed");
      return {
        status: "error",
        message: "The invitation was sent, but the role could not be set. Set it in the table.",
      };
    }
  }
  await admin.from("domain_events").insert({
    event_type: "user.invited",
    aggregate_type: "profile",
    aggregate_id: data.user.id,
    actor_id: actor.id,
    payload: { role },
  });

  revalidatePath("/admin/users");
  return { status: "success", message: `Invitation sent to ${email}.` };
}

const changeRoleSchema = z.object({ userId: z.uuid(), role: z.enum(ROLES) });

export async function changeRole(input: { userId: string; role: string }): Promise<ActionResult> {
  const actor = await userWithRole(SUPER);
  if (!actor) return { ok: false, message: "Only a Super Admin can change roles." };
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: friendly(error) };
  if (!data) return { ok: false, message: "That user no longer exists." };

  await createSupabaseAdminClient().auth.admin.updateUserById(parsed.data.userId, {
    app_metadata: { role: parsed.data.role },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: "Role updated." };
}

const setActiveSchema = z.object({ userId: z.uuid(), active: z.boolean() });

export async function setUserActive(input: { userId: string; active: boolean }): Promise<ActionResult> {
  const actor = await userWithRole(SUPER);
  if (!actor) return { ok: false, message: "Only a Super Admin can deactivate accounts." };
  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (parsed.data.userId === actor.id && !parsed.data.active) {
    return { ok: false, message: "You can't deactivate your own account." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: parsed.data.active })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: friendly(error) };
  if (!data) return { ok: false, message: "That user no longer exists." };

  // Banning in Supabase Auth also stops existing sessions from refreshing.
  const { error: banError } = await createSupabaseAdminClient().auth.admin.updateUserById(
    parsed.data.userId,
    {
      ban_duration: parsed.data.active ? "none" : "876000h",
    },
  );
  if (banError) logger.error({ code: banError.code }, "could not update auth ban state");

  revalidatePath("/admin/users");
  return { ok: true, message: parsed.data.active ? "Account reactivated." : "Account deactivated." };
}

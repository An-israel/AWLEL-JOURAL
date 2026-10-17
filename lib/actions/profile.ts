"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(200),
  affiliation: z.string().trim().max(300).optional(),
  orcid: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{4}-\d{4}-\d{3}[\dX])?$/, "Use the format 0000-0000-0000-0000.")
    .optional(),
});

export interface ProfileState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Updates the signed-in user's own name, affiliation and ORCID. */
export async function updateProfile(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session has ended. Please sign in again." };

  const parsed = profileSchema.safeParse({
    fullName: fd.get("fullName"),
    affiliation: fd.get("affiliation") || undefined,
    orcid: fd.get("orcid") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  // The user's own client: RLS allows only their row, and a trigger blocks
  // any change to role, status or email from here.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      affiliation: parsed.data.affiliation ?? null,
      orcid: parsed.data.orcid || null,
    })
    .eq("id", user.id);
  if (error) return { status: "error", message: "We couldn't save your profile. Please try again." };

  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return { status: "success", message: "Profile saved." };
}

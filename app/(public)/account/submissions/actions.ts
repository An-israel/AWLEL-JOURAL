"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResult, type ActionResult } from "@/lib/admin/result";
import { notifyRevisionUploaded } from "@/lib/server/notify";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** After a revised file is uploaded: note it on the timeline and tell the editors. */
export async function recordRevision(input: { submissionId: string; fileId: string }): Promise<ActionResult> {
  const parsed = z.object({ submissionId: z.uuid(), fileId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, title")
    .eq("id", parsed.data.submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  const { data: file } = await supabase
    .from("submission_files")
    .select("id")
    .eq("id", parsed.data.fileId)
    .eq("submission_id", parsed.data.submissionId)
    .eq("kind", "revision")
    .maybeSingle();
  if (!sub || !file) return forbiddenResult;

  await supabase.rpc("add_submission_note", {
    p_submission_id: sub.id,
    p_message: "Revised manuscript uploaded by the author.",
    p_visible_to_author: true,
  });
  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "submission.revised",
      aggregate_type: "submission",
      aggregate_id: sub.id,
      actor_id: user.id,
      payload: { fileId: file.id },
    });
  await notifyRevisionUploaded({ id: sub.id, title: sub.title, fileId: file.id });
  revalidatePath(`/account/submissions/${sub.id}`);
  return { ok: true, message: "Revised manuscript sent to the editors." };
}

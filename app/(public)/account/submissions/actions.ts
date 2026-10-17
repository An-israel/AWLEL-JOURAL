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
  // Checks in SQL: the file is a revision this author uploaded, and revisions
  // were requested. Records the note once per file.
  const { data, error } = await supabase.rpc("record_revision", { p_file_id: parsed.data.fileId });
  const sub = data?.[0];
  if (error || !sub || sub.submission_id !== parsed.data.submissionId) return forbiddenResult;
  if (!sub.recorded) return { ok: true, message: "Revised manuscript sent to the editors." };
  const file = { id: parsed.data.fileId };

  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "submission.revised",
      aggregate_type: "submission",
      aggregate_id: sub.submission_id,
      actor_id: user.id,
      payload: { fileId: file.id },
    });
  await notifyRevisionUploaded({ id: sub.submission_id, title: sub.title, fileId: file.id });
  revalidatePath(`/account/submissions/${sub.submission_id}`);
  return { ok: true, message: "Revised manuscript sent to the editors." };
}

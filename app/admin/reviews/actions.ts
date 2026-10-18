"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { sanitizeRichText } from "@/lib/sanitize";
import { notifyReviewDeclined, notifyReviewSubmitted } from "@/lib/server/notify";
import { RECOMMENDATIONS } from "@/lib/submission-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reviewSchema = z
  .object({
    assignmentId: z.uuid(),
    expectedVersion: z.number().int(),
    comments: z.string().max(100_000),
    confidentialComments: z.string().trim().max(100_000, "Please keep this under 100,000 characters."),
    recommendation: z.enum(RECOMMENDATIONS).nullable(),
    annotatedFileId: z.uuid().nullable(),
    submit: z.boolean(),
  })
  .refine((r) => !r.submit || r.recommendation, {
    message: "Choose a recommendation.",
    path: ["recommendation"],
  })
  .refine((r) => !r.submit || r.comments.replace(/<[^>]+>/g, "").trim().length >= 50, {
    message: "Please write your comments (at least a few sentences) before submitting.",
    path: ["comments"],
  });

/** Saves a draft review, or submits it. RLS + a trigger allow only the reviewer's own pending review. */
export async function saveReview(
  input: z.input<typeof reviewSchema>,
): Promise<ActionResult<{ version: number }>> {
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("review_assignments")
    .update({
      comments: sanitizeRichText(r.comments) || null,
      // Plain text, for the editors only: never shown to the author (item 60).
      confidential_comments: r.confidentialComments || null,
      recommendation: r.recommendation,
      annotated_file_id: r.annotatedFileId,
      ...(r.submit ? { status: "submitted" as const } : {}),
    })
    .eq("id", r.assignmentId)
    .eq("reviewer_id", user.id)
    .eq("version", r.expectedVersion)
    .select("version, submission_id")
    .maybeSingle();
  if (error) return fromDbError(error, "review");
  if (!data) return fromDbError({ code: "AW409", message: "" });

  if (r.submit && r.recommendation) {
    const { data: queue } = await supabase.rpc("reviewer_queue");
    const title = queue?.find((q) => q.assignment_id === r.assignmentId)?.title ?? "a manuscript";
    await createSupabaseAdminClient()
      .from("domain_events")
      .insert({
        event_type: "review.submitted",
        aggregate_type: "review_assignment",
        aggregate_id: r.assignmentId,
        actor_id: user.id,
        payload: { recommendation: r.recommendation },
      });
    await notifyReviewSubmitted({
      assignmentId: r.assignmentId,
      submissionId: data.submission_id,
      title,
      recommendation: r.recommendation,
    });
  }
  revalidatePath(`/admin/reviews/${r.assignmentId}`);
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: r.submit ? "Review submitted. Thank you!" : "Draft saved.",
    data: { version: data.version },
  };
}

const responseSchema = z.object({
  assignmentId: z.uuid(),
  accept: z.boolean(),
  reason: z.string().trim().max(2000, "Please keep the reason under 2,000 characters.").optional(),
});

/**
 * Accept or decline an invitation (item 60). Declining ends the reviewer's
 * access at once and tells the editors, with the optional reason.
 */
export async function respondToInvitation(input: z.input<typeof responseSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { assignmentId, accept, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: queue } = await supabase.rpc("reviewer_queue");
  const mine = queue?.find((q) => q.assignment_id === assignmentId);
  if (!mine || mine.assignment_status !== "pending")
    return { ok: false, message: "This invitation is no longer open." };

  const { data, error } = await supabase
    .from("review_assignments")
    .update(
      accept
        ? { response: "accepted" }
        : { response: "declined", status: "withdrawn" as const, decline_reason: reason || null },
    )
    .eq("id", assignmentId)
    .eq("reviewer_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return fromDbError(error, "review");
  if (!data) return { ok: false, message: "This invitation is no longer open." };

  if (!accept) {
    await createSupabaseAdminClient().from("domain_events").insert({
      event_type: "review.declined",
      aggregate_type: "review_assignment",
      aggregate_id: assignmentId,
      actor_id: user.id,
    });
    await notifyReviewDeclined({
      assignmentId,
      submissionId: mine.submission_id,
      title: mine.title,
      reviewerName: user.fullName,
      reason: reason || null,
    });
  }
  revalidatePath(`/admin/reviews/${assignmentId}`);
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: accept
      ? "Thank you for agreeing to review. The manuscript and form are below."
      : "Thank you for letting us know. The editors have been told.",
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { sanitizeRichText } from "@/lib/sanitize";
import { notifyReviewSubmitted } from "@/lib/server/notify";
import { RECOMMENDATIONS } from "@/lib/submission-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reviewSchema = z
  .object({
    assignmentId: z.uuid(),
    expectedVersion: z.number().int(),
    comments: z.string().max(100_000),
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

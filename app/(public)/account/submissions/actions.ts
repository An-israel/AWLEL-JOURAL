"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import {
  notifyReviewNoLongerNeeded,
  notifyRevisionUploaded,
  notifySubmissionWithdrawn,
} from "@/lib/server/notify";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { coAuthorSchema } from "../../submit/schema";

const revisionSchema = z.object({
  submissionId: z.uuid(),
  fileId: z.uuid(),
  response: z
    .string()
    .trim()
    .min(20, "Please tell the editors and reviewers what you changed (a few sentences at least).")
    .max(20000, "Please keep your response under 20,000 characters."),
});

/**
 * After a revised file is uploaded (item 52): stores the author's response to
 * the reviewers with it, moves the submission to "Revision received" and
 * tells the editors. The checks are in SQL (record_revision): the file is a
 * revision this author uploaded and revisions were requested. Once per file.
 */
export async function recordRevision(input: z.input<typeof revisionSchema>): Promise<ActionResult> {
  const parsed = revisionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_revision", {
    p_file_id: parsed.data.fileId,
    p_response: parsed.data.response,
  });
  const sub = data?.[0];
  if (error || !sub || sub.submission_id !== parsed.data.submissionId) return forbiddenResult;
  if (!sub.recorded) return { ok: true, message: "Revised manuscript sent to the editors." };

  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "submission.revised",
      aggregate_type: "submission",
      aggregate_id: sub.submission_id,
      actor_id: user.id,
      payload: { fileId: parsed.data.fileId },
    });
  await notifyRevisionUploaded({
    id: sub.submission_id,
    title: sub.title,
    fileId: parsed.data.fileId,
    response: parsed.data.response,
  });
  revalidatePath(`/account/submissions/${sub.submission_id}`);
  return { ok: true, message: "Revised manuscript sent to the editors. Thank you." };
}

const withdrawSchema = z.object({
  submissionId: z.uuid(),
  reason: z.string().trim().max(2000, "Please keep the reason under 2,000 characters.").optional(),
});

/** The author withdraws their manuscript (item 53). Final; the editors are told. */
export async function withdrawSubmission(input: z.input<typeof withdrawSchema>): Promise<ActionResult> {
  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, title")
    .eq("id", parsed.data.submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!sub) return forbiddenResult;

  // Reviews still outstanding are closed by the database; tell those reviewers.
  const pending = await pendingReviewers(sub.id);
  const reason = parsed.data.reason || null;
  const { error } = await supabase.rpc("withdraw_submission", {
    p_submission_id: sub.id,
    p_reason: reason ?? "",
  });
  if (error) {
    return error.code === "AW422"
      ? { ok: false, message: "This manuscript can no longer be withdrawn here. Please contact the editors." }
      : fromDbError(error, "submission");
  }
  await createSupabaseAdminClient().from("domain_events").insert({
    event_type: "submission.withdrawn",
    aggregate_type: "submission",
    aggregate_id: sub.id,
    actor_id: user.id,
  });
  await Promise.all([
    notifySubmissionWithdrawn({
      id: sub.id,
      title: sub.title,
      reason,
      authorEmail: user.email,
      authorName: user.fullName,
    }),
    ...pending.map((r) => notifyReviewNoLongerNeeded({ ...r, title: sub.title, reason: "decision" })),
  ]);
  revalidatePath(`/account/submissions/${sub.id}`);
  revalidatePath("/account/submissions");
  return { ok: true, message: "Your submission has been withdrawn." };
}

/** Pending reviewers of a submission (read with the service role: authors can't see reviews). */
async function pendingReviewers(submissionId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("review_assignments")
    .select("id, version, reviewer:profiles!review_assignments_reviewer_id_fkey(email, full_name)")
    .eq("submission_id", submissionId)
    .eq("status", "pending");
  return (data ?? []).flatMap((a) =>
    a.reviewer
      ? [
          {
            assignmentId: a.id,
            version: a.version,
            reviewerEmail: a.reviewer.email,
            reviewerName: a.reviewer.full_name,
          },
        ]
      : [],
  );
}

const detailsSchema = z.object({
  submissionId: z.uuid(),
  expectedVersion: z.number().int(),
  title: z.string().trim().min(5, "Enter the title of your manuscript.").max(500),
  abstract: z
    .string()
    .trim()
    .min(100, "The abstract should be at least 100 characters.")
    .max(6000, "Please keep the abstract under 6,000 characters."),
  keywords: z
    .array(z.string().trim().min(1).max(80))
    .min(3, "Give at least three keywords.")
    .max(10, "Use at most ten keywords."),
  coAuthors: z.array(coAuthorSchema).max(20),
});

function paragraphs(text: string): string {
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * "Edit details" (item 53): title, abstract, keywords and co-authors, while
 * the submission is still "Submitted" (before screening starts). Runs as the
 * author, so RLS and the guard trigger decide what may change.
 */
export async function updateSubmissionDetails(input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", d.submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!sub) return forbiddenResult;
  if (sub.status !== "submitted")
    return {
      ok: false,
      message: "The editors have started on this manuscript, so its details can't be changed here.",
    };

  const { data: saved, error } = await supabase
    .from("submissions")
    .update({ title: d.title, abstract: paragraphs(d.abstract), keywords: [...new Set(d.keywords)] })
    .eq("id", d.submissionId)
    .eq("version", d.expectedVersion)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) return fromDbError(error, "submission");
  if (!saved) return fromDbError({ code: "AW409", message: "" });

  // Co-authors: the corresponding author (position 0) stays; the rest are replaced.
  const { error: deleteError } = await supabase
    .from("submission_authors")
    .delete()
    .eq("submission_id", d.submissionId)
    .eq("is_corresponding", false);
  if (deleteError) return fromDbError(deleteError, "co-author");
  if (d.coAuthors.length) {
    const { error: insertError } = await supabase.from("submission_authors").insert(
      d.coAuthors.map((a, i) => ({
        submission_id: d.submissionId,
        full_name: a.fullName,
        affiliation: a.affiliation || null,
        email: a.email || null,
        position: i + 1,
        is_corresponding: false,
      })),
    );
    if (insertError) return fromDbError(insertError, "co-author");
  }
  revalidatePath(`/account/submissions/${d.submissionId}`);
  return { ok: true, message: "Details saved." };
}

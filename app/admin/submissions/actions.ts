"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sanitizeRichText } from "@/lib/sanitize";
import { userWithRole } from "@/lib/auth";
import { slugify } from "@/lib/admin/slug";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import {
  notifyNote,
  notifyReviewerAssigned,
  notifyReviewNoLongerNeeded,
  notifyStatusChanged,
} from "@/lib/server/notify";
import { canMoveTo, CLOSED_STATUSES, STATUS_LABELS, SUBMISSION_STATUSES } from "@/lib/submission-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;

/** Workflow rule refusals from the database (AW422) carry a message meant for people. */
function workflowError(error: { code?: string; message: string }, subject: string): ActionResult<never> {
  return error.code === "AW422" ? { ok: false, message: error.message } : fromDbError(error, subject);
}

/** Pending reviewers of a submission, to tell them when a decision closes their review (item 59). */
async function pendingReviewers(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
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

const statusSchema = z
  .object({
    id: z.uuid(),
    expectedVersion: z.number().int(),
    status: z.enum(SUBMISSION_STATUSES),
    message: z.string().trim().max(20000).optional(),
    /** Show the message on the author's timeline (item 63). */
    visibleToAuthor: z.boolean(),
    /** Email the author; implies visibleToAuthor. */
    emailAuthor: z.boolean(),
    revisionDueDate: z.union([z.literal(""), z.iso.date()]).optional(),
  })
  .transform((v) => ({ ...v, visibleToAuthor: v.visibleToAuthor || v.emailAuthor }));

/**
 * Changes the status, or adds a note when the status stays the same
 * (item 55). Only the moves in NEXT_STATUSES are offered, and the database
 * refuses any other (item 56). A decision closes outstanding reviews and
 * those reviewers are told (item 59).
 */
export async function changeSubmissionStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ version: number }>> {
  const actor = await userWithRole(STAFF);
  if (!actor) return forbiddenResult;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select(
      "status, version, title, finalised_at, author:profiles!submissions_author_id_fkey(email, full_name)",
    )
    .eq("id", p.id)
    .maybeSingle();
  if (!sub) return { ok: false, message: "Submission not found." };

  if (p.status === sub.status) return addNote(p, sub);
  if (!sub.finalised_at && sub.status === "submitted") {
    return {
      ok: false,
      message:
        "The author hasn't finished this submission (no Word manuscript yet), so its status can't change.",
    };
  }

  if (!canMoveTo(sub.status, p.status)) {
    return {
      ok: false,
      message: `A submission can't move from “${STATUS_LABELS[sub.status]}” to “${STATUS_LABELS[p.status]}”.`,
    };
  }
  if (sub.status === "rejected" && !p.message) {
    return {
      ok: false,
      message: "Add a message explaining why the manuscript is being reopened.",
      fieldErrors: { message: "Required when reopening a rejected manuscript." },
    };
  }
  const closing = CLOSED_STATUSES.includes(p.status) ? await pendingReviewers(p.id) : [];
  const { data: version, error } = await supabase.rpc("change_submission_status", {
    p_submission_id: p.id,
    p_expected_version: p.expectedVersion,
    p_status: p.status,
    p_message: p.message ?? "",
    p_visible_to_author: p.visibleToAuthor,
    ...(p.status === "revisions_requested" && p.revisionDueDate
      ? { p_revision_due_date: p.revisionDueDate }
      : {}),
  });
  if (error) return workflowError(error, "submission");

  const { data: after } = await supabase
    .from("submissions")
    .select("revision_due_date")
    .eq("id", p.id)
    .maybeSingle();
  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "submission.status_changed",
      aggregate_type: "submission",
      aggregate_id: p.id,
      actor_id: actor.id,
      payload: { status: p.status, version },
    });
  await Promise.all([
    p.emailAuthor && sub.author
      ? notifyStatusChanged({
          id: p.id,
          title: sub.title,
          authorEmail: sub.author.email,
          authorName: sub.author.full_name,
          status: p.status,
          message: p.message || null,
          // The status changed, so the version is new: a unique key per change.
          eventKey: `${p.id}:${version}`,
          revisionDueDate: after?.revision_due_date ?? null,
        })
      : null,
    ...closing.map((r) => notifyReviewNoLongerNeeded({ ...r, title: sub.title, reason: "decision" })),
  ]);
  revalidatePath(`/admin/submissions/${p.id}`);
  const closed = closing.length
    ? ` ${closing.length === 1 ? "The outstanding review was" : `${closing.length} outstanding reviews were`} closed and the reviewer${closing.length === 1 ? " was" : "s were"} told.`
    : "";
  return {
    ok: true,
    message:
      (p.emailAuthor
        ? "Status changed and the author has been emailed."
        : p.visibleToAuthor && p.message
          ? "Status changed. The message is on the author's timeline; no email was sent."
          : "Status changed. The author was not emailed.") + closed,
    data: { version },
  };
}

/** A note on the timeline without a status change (item 55): saved, emailed with its own key. */
async function addNote(
  p: {
    id: string;
    expectedVersion: number;
    message?: string;
    visibleToAuthor: boolean;
    emailAuthor: boolean;
  },
  sub: { title: string; author: { email: string; full_name: string } | null },
): Promise<ActionResult<{ version: number }>> {
  if (!p.message) {
    return {
      ok: false,
      message: "Write the note first.",
      fieldErrors: { message: "Write the note, or choose a new status." },
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data: eventId, error } = await supabase.rpc("add_submission_note", {
    p_submission_id: p.id,
    p_message: p.message,
    p_visible_to_author: p.visibleToAuthor,
  });
  if (error || !eventId) return workflowError(error ?? { message: "note failed" }, "note");
  if (p.emailAuthor && sub.author) {
    await notifyNote({
      id: p.id,
      eventId,
      title: sub.title,
      authorEmail: sub.author.email,
      authorName: sub.author.full_name,
      message: p.message,
    });
  }
  revalidatePath(`/admin/submissions/${p.id}`);
  return {
    ok: true,
    message: p.emailAuthor
      ? "Note added to the author's timeline and emailed to them."
      : p.visibleToAuthor
        ? "Note added to the author's timeline. No email was sent."
        : "Note added for the editors only.",
    // A note doesn't change the submission, so its version stays.
    data: { version: p.expectedVersion },
  };
}

const assignSchema = z.object({
  submissionId: z.uuid(),
  reviewerId: z.uuid("Choose a reviewer."),
  dueDate: z.union([z.literal(""), z.iso.date()]).optional(),
});

/**
 * Invites a reviewer to the submission's current round (item 58). The same
 * reviewer can be invited again in a later round; re-inviting someone
 * withdrawn in this round reopens their invitation with a fresh email.
 */
export async function assignReviewer(input: z.input<typeof assignSchema>): Promise<ActionResult> {
  const actor = await userWithRole(STAFF);
  if (!actor) return forbiddenResult;
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: reviewer } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", a.reviewerId)
    .maybeSingle();
  if (!reviewer?.is_active || !["reviewer", "editor", "super_admin"].includes(reviewer.role)) {
    return { ok: false, message: "That person can't review manuscripts." };
  }
  const { data: sub } = await supabase
    .from("submissions")
    .select("title, author_id, status, review_round")
    .eq("id", a.submissionId)
    .single();
  if (!sub) return { ok: false, message: "Submission not found." };
  if (sub.author_id === reviewer.id)
    return { ok: false, message: "An author can't review their own manuscript." };
  if (CLOSED_STATUSES.includes(sub.status))
    return {
      ok: false,
      message: "A decision has been made on this submission, so no more reviews are needed.",
    };

  const { data: existing } = await supabase
    .from("review_assignments")
    .select("id, status")
    .eq("submission_id", a.submissionId)
    .eq("reviewer_id", a.reviewerId)
    .eq("round", sub.review_round)
    .maybeSingle();
  if (existing && existing.status !== "withdrawn") {
    return {
      ok: false,
      message:
        existing.status === "submitted"
          ? "This reviewer has already reviewed this round."
          : "This reviewer has already been invited to this round.",
    };
  }
  const values = {
    assigned_by: actor.id,
    due_date: a.dueDate || null,
    status: "pending" as const,
    response: null,
    decline_reason: null,
  };
  const { data, error } = existing
    ? await supabase
        .from("review_assignments")
        .update(values)
        .eq("id", existing.id)
        .eq("status", "withdrawn")
        .select("id, round, version")
        .single()
    : await supabase
        .from("review_assignments")
        .insert({ ...values, submission_id: a.submissionId, reviewer_id: a.reviewerId })
        .select("id, round, version")
        .single();
  if (error) return fromDbError(error, "assignment");

  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "review.assigned",
      aggregate_type: "review_assignment",
      aggregate_id: data.id,
      actor_id: actor.id,
      payload: { round: data.round },
    });
  await notifyReviewerAssigned({
    assignmentId: data.id,
    reviewerEmail: reviewer.email,
    reviewerName: reviewer.full_name,
    title: sub.title,
    dueDate: a.dueDate || null,
    round: data.round,
    version: data.version,
  });
  revalidatePath(`/admin/submissions/${a.submissionId}`);
  return { ok: true, message: `${reviewer.full_name || reviewer.email} has been invited to review.` };
}

/** Withdraws a pending invitation (item 62): says so if the review already arrived, and tells the reviewer. */
export async function withdrawAssignment(input: {
  assignmentId: string;
  submissionId: string;
}): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z.object({ assignmentId: z.uuid(), submissionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("review_assignments")
    .update({ status: "withdrawn" })
    .eq("id", parsed.data.assignmentId)
    .eq("submission_id", parsed.data.submissionId)
    .eq("status", "pending")
    .select(
      "id, version, submission:submissions(title), reviewer:profiles!review_assignments_reviewer_id_fkey(email, full_name)",
    );
  if (error) return fromDbError(error, "assignment");
  const row = data?.[0];
  if (!row) {
    const { data: current } = await supabase
      .from("review_assignments")
      .select("status")
      .eq("id", parsed.data.assignmentId)
      .maybeSingle();
    return {
      ok: false,
      message:
        current?.status === "submitted"
          ? "This reviewer already submitted their review, so it can't be withdrawn."
          : "This invitation was already withdrawn or declined.",
    };
  }
  if (row.reviewer) {
    await notifyReviewNoLongerNeeded({
      assignmentId: row.id,
      version: row.version,
      reviewerEmail: row.reviewer.email,
      reviewerName: row.reviewer.full_name,
      title: row.submission?.title ?? "the manuscript",
      reason: "withdrawn",
    });
  }
  revalidatePath(`/admin/submissions/${parsed.data.submissionId}`);
  return {
    ok: true,
    message: "Reviewer withdrawn and told by email. Their access to the manuscript has ended.",
  };
}

/** Review comments (rich text) as plain text for the author's timeline. */
function reviewText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * "Share with the author" (item 52): copies a submitted review's comments to
 * the author's timeline, anonymously ("Reviewer 2, round 1"). Confidential
 * comments, the reviewer's name and their marked-up file are never shared.
 */
export async function shareReviewWithAuthor(input: {
  assignmentId: string;
  submissionId: string;
}): Promise<ActionResult> {
  const actor = await userWithRole(STAFF);
  if (!actor) return forbiddenResult;
  const parsed = z.object({ assignmentId: z.uuid(), submissionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data: reviews } = await supabase
    .from("review_assignments")
    .select("id, round, comments, status, shared_with_author_at, created_at")
    .eq("submission_id", parsed.data.submissionId)
    .order("created_at");
  const review = reviews?.find((r) => r.id === parsed.data.assignmentId);
  if (!review || review.status !== "submitted" || !review.comments)
    return { ok: false, message: "Only a submitted review with comments can be shared." };
  if (review.shared_with_author_at)
    return { ok: true, message: "These comments are already on the author's timeline." };

  // Number reviewers within the round, in the order they were invited.
  const n = (reviews ?? []).filter((r) => r.round === review.round).findIndex((r) => r.id === review.id) + 1;
  const { error } = await supabase.rpc("add_submission_note", {
    p_submission_id: parsed.data.submissionId,
    p_message: `Comments from Reviewer ${n} (review round ${review.round}):\n\n${reviewText(review.comments)}`,
    p_visible_to_author: true,
  });
  if (error) return workflowError(error, "note");
  await supabase
    .from("review_assignments")
    .update({ shared_with_author_at: new Date().toISOString() })
    .eq("id", review.id);
  revalidatePath(`/admin/submissions/${parsed.data.submissionId}`);
  return {
    ok: true,
    message: "The comments are on the author's timeline, without the reviewer's name. No email was sent.",
  };
}

/** Accepted manuscript → draft article pre-filled from the submission (section 7). */
export async function createArticleFromSubmission(input: {
  submissionId: string;
  issueId: string;
}): Promise<ActionResult<{ articleId: string }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z.object({ submissionId: z.uuid(), issueId: z.uuid("Choose an issue.") }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase
    .from("submissions")
    .select(
      "id, version, title, abstract, keywords, category_id, citation_style, status, article_id, authors:submission_authors(full_name, affiliation, email, orcid, position, is_corresponding)",
    )
    .eq("id", parsed.data.submissionId)
    .single();
  if (!s) return { ok: false, message: "Submission not found." };
  if (s.article_id)
    return {
      ok: true,
      message: "An article already exists for this submission.",
      data: { articleId: s.article_id },
    };
  if (s.status !== "accepted")
    return { ok: false, message: "Only accepted manuscripts can become articles." };

  let slug = slugify(s.title);
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  if (count) slug = `${slug.slice(0, 70)}-${s.id.slice(0, 6)}`;

  const { data: article, error } = await supabase
    .rpc("save_article", {
      p_id: null as unknown as string,
      p_expected_version: null as unknown as number,
      p_data: {
        issue_id: parsed.data.issueId,
        category_id: s.category_id ?? "",
        title: s.title,
        slug,
        abstract: sanitizeRichText(s.abstract),
        keywords: s.keywords,
        first_page: "",
        last_page: "",
        doi: "",
        citation_style: s.citation_style,
        published_at: "",
        submission_id: s.id,
      },
      p_authors: [...s.authors]
        .sort((a, b) => a.position - b.position)
        .map((a) => ({
          full_name: a.full_name,
          affiliation: a.affiliation ?? "",
          email: a.email ?? "",
          orcid: a.orcid ?? "",
          show_email: false,
          is_corresponding: a.is_corresponding,
        })),
    })
    .single();
  if (error) return fromDbError(error, "article");

  const { error: linkError } = await supabase
    .from("submissions")
    .update({ article_id: article.id })
    .eq("id", s.id)
    .eq("version", s.version);
  if (linkError) return fromDbError(linkError, "submission");
  expireCatalog({ issueIds: [parsed.data.issueId] });
  return {
    ok: true,
    message: "Draft article created. Attach the final files, then publish.",
    data: { articleId: article.id },
  };
}

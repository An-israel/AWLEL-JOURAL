"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { slugify } from "@/lib/admin/slug";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import { notifyReviewerAssigned, notifyStatusChanged } from "@/lib/server/notify";
import { SUBMISSION_STATUSES } from "@/lib/submission-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "editor"] as const;

const statusSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.number().int(),
  status: z.enum(SUBMISSION_STATUSES),
  message: z.string().trim().max(5000).optional(),
  notifyAuthor: z.boolean(),
});

/** Changes status; when the author is to be told, the message is emailed too. */
export async function changeSubmissionStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ version: number }>> {
  const actor = await userWithRole(STAFF);
  if (!actor) return forbiddenResult;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: version, error } = await supabase.rpc("change_submission_status", {
    p_submission_id: p.id,
    p_expected_version: p.expectedVersion,
    p_status: p.status,
    p_message: (p.message || null) as string,
    p_visible_to_author: p.notifyAuthor,
  });
  if (error) return fromDbError(error, "submission");

  const { data: sub } = await supabase
    .from("submissions")
    .select("title, author:profiles!submissions_author_id_fkey(email, full_name)")
    .eq("id", p.id)
    .single();
  await createSupabaseAdminClient()
    .from("domain_events")
    .insert({
      event_type: "submission.status_changed",
      aggregate_type: "submission",
      aggregate_id: p.id,
      actor_id: actor.id,
      payload: { status: p.status, version },
    });
  if (p.notifyAuthor && sub?.author) {
    await notifyStatusChanged({
      id: p.id,
      title: sub.title,
      authorEmail: sub.author.email,
      authorName: sub.author.full_name,
      status: p.status,
      message: p.message || null,
      eventKey: `${p.id}:${version}`,
    });
  }
  revalidatePath(`/admin/submissions/${p.id}`);
  return {
    ok: true,
    message: p.notifyAuthor ? "Status changed and the author has been emailed." : "Status changed.",
    data: { version },
  };
}

const assignSchema = z.object({
  submissionId: z.uuid(),
  reviewerId: z.uuid("Choose a reviewer."),
  dueDate: z.union([z.literal(""), z.iso.date()]).optional(),
});

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
    .select("title, author_id")
    .eq("id", a.submissionId)
    .single();
  if (!sub) return { ok: false, message: "Submission not found." };
  if (sub.author_id === reviewer.id)
    return { ok: false, message: "An author can't review their own manuscript." };

  // Re-assigning someone who was withdrawn reopens their assignment.
  const { data, error } = await supabase
    .from("review_assignments")
    .upsert(
      {
        submission_id: a.submissionId,
        reviewer_id: a.reviewerId,
        assigned_by: actor.id,
        due_date: a.dueDate || null,
        status: "pending",
      },
      { onConflict: "submission_id,reviewer_id" },
    )
    .select("id")
    .single();
  if (error) return fromDbError(error, "assignment");

  await createSupabaseAdminClient().from("domain_events").insert({
    event_type: "review.assigned",
    aggregate_type: "review_assignment",
    aggregate_id: data.id,
    actor_id: actor.id,
  });
  await notifyReviewerAssigned({
    assignmentId: data.id,
    reviewerEmail: reviewer.email,
    reviewerName: reviewer.full_name,
    title: sub.title,
    dueDate: a.dueDate || null,
  });
  revalidatePath(`/admin/submissions/${a.submissionId}`);
  return { ok: true, message: `${reviewer.full_name || reviewer.email} has been invited to review.` };
}

export async function withdrawAssignment(input: {
  assignmentId: string;
  submissionId: string;
}): Promise<ActionResult> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z.object({ assignmentId: z.uuid(), submissionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("review_assignments")
    .update({ status: "withdrawn" })
    .eq("id", parsed.data.assignmentId)
    .eq("status", "pending");
  if (error) return fromDbError(error, "assignment");
  revalidatePath(`/admin/submissions/${parsed.data.submissionId}`);
  return { ok: true, message: "Reviewer withdrawn. Their access to the manuscript has ended." };
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
        abstract: s.abstract,
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

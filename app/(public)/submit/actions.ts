"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { logger } from "@/lib/server/logger";
import { notifySubmissionReceived } from "@/lib/server/notify";
import { checkRateLimit, RATE_LIMITS } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { submissionSchema, type SubmissionInput } from "./schema";

const SUBMITTING_ROLES = ["author", "editor", "super_admin"];

function paragraphs(text: string): string {
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Step 1 of submitting: create the submission (or return the one this
 * idempotency key already created, so a double click or retry never makes a
 * duplicate). Files are uploaded next, then `finalizeSubmission` runs.
 */
export async function createSubmission(input: SubmissionInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user || !SUBMITTING_ROLES.includes(user.role)) return forbiddenResult;
  const flags = await getFeatureFlags();
  if (!flags.submissions_open) return { ok: false, message: "Submissions are closed at the moment." };

  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("submissions")
    .select("id")
    .eq("author_id", user.id)
    .eq("idempotency_key", s.idempotencyKey)
    .maybeSingle();
  if (existing) return { ok: true, data: { id: existing.id } };

  const limit = await checkRateLimit(RATE_LIMITS.submission, `user:${user.id}`);
  if (!limit.allowed)
    return { ok: false, message: "You've submitted several manuscripts recently. Please try again later." };

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      author_id: user.id,
      title: s.title,
      abstract: paragraphs(s.abstract),
      keywords: [...new Set(s.keywords)],
      category_id: s.categoryId,
      citation_style: s.citationStyle,
      cover_letter: s.coverLetter || null,
      declarations: { ...s.declarations, confirmedAt: new Date().toISOString() },
      idempotency_key: s.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) {
    // A concurrent request with the same key won the race: return its row.
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("submissions")
        .select("id")
        .eq("author_id", user.id)
        .eq("idempotency_key", s.idempotencyKey)
        .single();
      if (raced) return { ok: true, data: { id: raced.id } };
    }
    return fromDbError(error, "submission");
  }

  const authors = [
    {
      full_name: user.fullName,
      affiliation: s.affiliation,
      email: user.email,
      orcid: user.orcid,
      is_corresponding: true,
    },
    ...s.coAuthors.map((a) => ({
      full_name: a.fullName,
      affiliation: a.affiliation || null,
      email: a.email || null,
      orcid: null,
      is_corresponding: false,
    })),
  ];
  const { error: authorsError } = await supabase
    .from("submission_authors")
    .insert(authors.map((a, i) => ({ ...a, submission_id: data.id, position: i })));
  if (authorsError) logger.error({ err: authorsError }, "could not save submission authors");

  if (!user.affiliation)
    await supabase.from("profiles").update({ affiliation: s.affiliation }).eq("id", user.id);
  return { ok: true, data: { id: data.id } };
}

/** Step 3: once the manuscript file is in, announce the submission (idempotent). */
export async function finalizeSubmission(submissionId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(submissionId).success) return { ok: false, message: "Invalid submission." };
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, title")
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!sub) return forbiddenResult;
  const { count } = await supabase
    .from("submission_files")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("kind", "original")
    .like("original_name", "%.docx");
  if (!count) return { ok: false, message: "Please upload your manuscript as a Word document (.docx)." };

  const admin = createSupabaseAdminClient();
  const { count: announced } = await admin
    .from("domain_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "submission.created")
    .eq("aggregate_id", submissionId);
  if (!announced) {
    await admin
      .from("domain_events")
      .insert({
        event_type: "submission.created",
        aggregate_type: "submission",
        aggregate_id: submissionId,
        actor_id: user.id,
      });
    await notifySubmissionReceived({
      id: sub.id,
      title: sub.title,
      authorEmail: user.email,
      authorName: user.fullName,
    });
  }
  return { ok: true, message: "Your manuscript has been submitted." };
}

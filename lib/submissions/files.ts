"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { fromDbError, forbiddenResult, type ActionResult } from "@/lib/admin/result";
import { isStaff } from "@/lib/roles";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signatureMatches } from "@/lib/file-signature";
import { readObjectHead } from "@/lib/server/file-head";
import { checkSubmissionFile, type SubmissionFileKind } from "./file-rules";

/*
 * Files in the private `submissions` bucket. Who may add which kind:
 *   original            the submitting author, while status is "submitted"
 *   revision            the author, while status is "revisions_requested"
 *   reviewer_annotated  a reviewer with a pending assignment
 * Editors may add any kind. Checked here, and again by RLS and storage policies.
 */

const BUCKET = "submissions";
const kindSchema = z.enum(["original", "revision", "reviewer_annotated"]);

async function mayUpload(submissionId: string, kind: SubmissionFileKind): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isStaff(user.role)) return true;
  const supabase = await createSupabaseServerClient();
  if (kind === "reviewer_annotated") {
    const { data } = await supabase
      .from("review_assignments")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("reviewer_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase
    .from("submissions")
    .select("status")
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  return (
    (kind === "original" && data?.status === "submitted") ||
    (kind === "revision" && data?.status === "revisions_requested")
  );
}

const requestSchema = z.object({
  submissionId: z.uuid(),
  kind: kindSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200),
  size: z.number().int().positive(),
});

export async function requestSubmissionUpload(
  input: z.infer<typeof requestSchema>,
): Promise<ActionResult<{ bucket: string; path: string; token: string }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid upload request." };
  const { submissionId, kind, fileName, mimeType, size } = parsed.data;
  const problem = checkSubmissionFile(
    { name: fileName, type: mimeType, size },
    kind === "original" && fileName.toLowerCase().endsWith(".docx"),
  );
  if (problem) return { ok: false, message: problem };
  if (!(await mayUpload(submissionId, kind))) return forbiddenResult;

  // Neutral object names: the original name (often the author's surname) is
  // kept only in the database, so signed links never reveal it (blinding).
  const ext = fileName
    .slice(fileName.lastIndexOf("."))
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "");
  const path = `${submissionId}/${kind}/${randomUUID()}${ext}`;
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logger.error({ err: error?.message }, "could not create submission upload URL");
    return { ok: false, message: "The upload could not be started. Please try again." };
  }
  return { ok: true, data: { bucket: BUCKET, path: data.path, token: data.token } };
}

const attachSchema = requestSchema.extend({ path: z.string().min(1).max(600) });

export async function attachSubmissionFile(
  input: z.infer<typeof attachSchema>,
): Promise<ActionResult<{ id: string; version: number }>> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid upload." };
  const { submissionId, kind, path, fileName, mimeType, size } = parsed.data;
  const user = await getCurrentUser();
  if (!user || !(await mayUpload(submissionId, kind))) return forbiddenResult;
  if (!path.startsWith(`${submissionId}/${kind}/`) || path.includes(".."))
    return { ok: false, message: "Invalid upload path." };
  const problem = checkSubmissionFile({ name: fileName, type: mimeType, size });
  if (problem) return { ok: false, message: problem };

  const admin = createSupabaseAdminClient();
  // The content must match the declared type, not just the name (magic bytes).
  const head = await readObjectHead(BUCKET, path);
  if (!head || !signatureMatches(mimeType, head)) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, message: `${fileName} doesn't look like a real Word or PDF file.` };
  }
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listing } = await admin.storage.from(BUCKET).list(dir, { search: name, limit: 1 });
  const object = listing?.find((o) => o.name === name);
  if (!object) return { ok: false, message: "The upload didn't finish. Please try again." };

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("submission_files")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("kind", kind);
  const { data, error } = await supabase
    .from("submission_files")
    .insert({
      submission_id: submissionId,
      path,
      original_name: fileName,
      mime_type: mimeType,
      size_bytes: (object.metadata?.size as number | undefined) ?? size,
      kind,
      uploaded_by: user.id,
      version: (count ?? 0) + 1,
    })
    .select("id, version")
    .single();
  if (error || !data) {
    // Compensation: the object must not outlive a failed database write.
    await admin.storage.from(BUCKET).remove([path]);
    return fromDbError(error ?? { message: "insert failed" }, "file");
  }
  return { ok: true, data };
}

/**
 * Signed download link. Staff, the author and the uploader read the file row
 * through RLS. Reviewers can't read file rows at all (they carry the original
 * name and uploader); their access is checked against reviewer_files(), and
 * they get a neutral file name, because original names often contain the
 * author's name.
 */
export async function submissionFileUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  if (!z.uuid().safeParse(fileId).success) return { ok: false, message: "Invalid file." };
  const user = await getCurrentUser();
  if (!user) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: visible } = await supabase
    .from("submission_files")
    .select("id")
    .eq("id", fileId)
    .maybeSingle();
  let blinded = false;
  if (!visible) {
    const { data: assigned } = await supabase.rpc("reviewer_files");
    if (!assigned?.some((f) => f.file_id === fileId)) return { ok: false, message: "File not found." };
    blinded = true;
  }
  // Allowed: read the details with the service role (the reviewer can't).
  const { data: file } = await admin
    .from("submission_files")
    .select("path, original_name, kind, version, submission_id")
    .eq("id", fileId)
    .single();
  if (!file) return { ok: false, message: "File not found." };

  const ext = file.original_name.slice(file.original_name.lastIndexOf(".")).toLowerCase();
  const label =
    file.kind === "revision"
      ? "Revised_manuscript"
      : file.kind === "reviewer_annotated"
        ? "Annotated_review"
        : "Manuscript";
  const downloadName = blinded
    ? `${label}_${file.submission_id.slice(0, 8)}_v${file.version}${ext}`
    : file.original_name;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(file.path, 300, { download: downloadName });
  if (error || !data) return { ok: false, message: "Could not open the file." };
  return { ok: true, data: { url: data.signedUrl } };
}

"use client";

import { putToSignedUrl } from "@/lib/admin/upload-client";
import { MIME } from "@/lib/admin/file-slots";
import type { ActionResult } from "@/lib/admin/result";
import { stripDocxAuthor } from "./docx-metadata";
import { checkSubmissionFile, submissionMimeOf, type SubmissionFileKind } from "./file-rules";
import { attachSubmissionFile, requestSubmissionUpload } from "./files";

/**
 * An author's Word file without their name in its properties (item 54).
 * Reviewers' files are left as they are.
 */
async function prepare(kind: SubmissionFileKind, file: File, mime: string): Promise<File> {
  if (kind === "reviewer_annotated" || mime !== MIME.docx) return file;
  try {
    const stripped = stripDocxAuthor(new Uint8Array(await file.arrayBuffer()));
    if (stripped)
      return new File([stripped as BlobPart], file.name, { type: mime, lastModified: file.lastModified });
  } catch {
    // Unreadable as a .docx: upload it unchanged and let the server decide.
  }
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export async function uploadSubmissionFile(
  submissionId: string,
  kind: SubmissionFileKind,
  original: File,
  onProgress?: (fraction: number) => void,
  requireDocx = false,
): Promise<ActionResult<{ id: string; version: number }>> {
  const problem = checkSubmissionFile(original, requireDocx);
  if (problem) return { ok: false, message: problem };
  // Some devices report no type for Word or PDF files (item 49): use the real one.
  const mime = submissionMimeOf(original)!;
  const file = await prepare(kind, original, mime);
  const ticket = await requestSubmissionUpload({
    submissionId,
    kind,
    fileName: file.name,
    mimeType: mime,
    size: file.size,
  });
  if (!ticket.ok || !ticket.data) return ticket.ok ? { ok: false, message: "Upload failed." } : ticket;
  const done = await putToSignedUrl(
    ticket.data.bucket,
    ticket.data.path,
    ticket.data.token,
    file,
    onProgress,
  );
  if (!done)
    return { ok: false, message: `${file.name} could not be uploaded. Check your connection and try again.` };
  return attachSubmissionFile({
    submissionId,
    kind,
    path: ticket.data.path,
    fileName: file.name,
    mimeType: mime,
    size: file.size,
  });
}

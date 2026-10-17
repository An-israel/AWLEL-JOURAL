"use client";

import { putToSignedUrl } from "@/lib/admin/upload-client";
import type { ActionResult } from "@/lib/admin/result";
import { checkSubmissionFile, type SubmissionFileKind } from "./file-rules";
import { attachSubmissionFile, requestSubmissionUpload } from "./files";

export async function uploadSubmissionFile(
  submissionId: string,
  kind: SubmissionFileKind,
  file: File,
  onProgress?: (fraction: number) => void,
  requireDocx = false,
): Promise<ActionResult<{ id: string; version: number }>> {
  const problem = checkSubmissionFile(file, requireDocx);
  if (problem) return { ok: false, message: problem };
  const ticket = await requestSubmissionUpload({
    submissionId,
    kind,
    fileName: file.name,
    mimeType: file.type,
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
    mimeType: file.type,
    size: file.size,
  });
}

import { MIME, safeFileName } from "@/lib/admin/file-slots";

export type SubmissionFileKind = "original" | "revision" | "reviewer_annotated";

/** Manuscripts and annotated files: Word or PDF, at most 20 MB (section 7). */
export const SUBMISSION_MAX_BYTES = 20 * 1024 * 1024;
export const SUBMISSION_MIMES = [MIME.docx, MIME.pdf] as const;

export function checkSubmissionFile(
  file: { name: string; type: string; size: number },
  requireDocx = false,
): string | null {
  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(".docx") && file.type === MIME.docx;
  const isPdf = name.endsWith(".pdf") && file.type === MIME.pdf;
  if (requireDocx && !isDocx) return "The manuscript must be a Word document (.docx).";
  if (!isDocx && !isPdf) return `${file.name} must be a Word document (.docx) or a PDF.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > SUBMISSION_MAX_BYTES) return `${file.name} is larger than 20 MB.`;
  return null;
}

export { safeFileName };

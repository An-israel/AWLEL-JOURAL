import { MIME, safeFileName } from "@/lib/admin/file-slots";

export type SubmissionFileKind = "original" | "revision" | "reviewer_annotated";

/** Manuscripts and annotated files: Word or PDF, at most 20 MB (section 7). */
export const SUBMISSION_MAX_BYTES = 20 * 1024 * 1024;
export const SUBMISSION_MIMES = [MIME.docx, MIME.pdf] as const;

/**
 * Some Windows PCs without Office and some Android file pickers report no
 * type, or a generic one, for Word and PDF files (item 49). Those are
 * accepted when the extension fits; the server's magic-byte check still
 * makes sure the content really is Word or PDF.
 */
const UNKNOWN_TYPES = ["", "application/octet-stream"];

/**
 * The file's real type, from its extension and the type the browser
 * reported, or null if it isn't a Word document or PDF. Extensions are
 * compared in lower case, so "PAPER.DOCX" counts (item 48).
 */
export function submissionMimeOf(file: {
  name: string;
  type: string;
}): (typeof SUBMISSION_MIMES)[number] | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".docx") && (type === MIME.docx || UNKNOWN_TYPES.includes(type))) return MIME.docx;
  if (name.endsWith(".pdf") && (type === MIME.pdf || UNKNOWN_TYPES.includes(type))) return MIME.pdf;
  return null;
}

export function checkSubmissionFile(
  file: { name: string; type: string; size: number },
  requireDocx = false,
): string | null {
  const mime = submissionMimeOf(file);
  if (requireDocx && mime !== MIME.docx) return "The manuscript must be a Word document (.docx).";
  if (!mime) return `${file.name} must be a Word document (.docx) or a PDF.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > SUBMISSION_MAX_BYTES) return `${file.name} is larger than 20 MB.`;
  return null;
}

export { safeFileName };

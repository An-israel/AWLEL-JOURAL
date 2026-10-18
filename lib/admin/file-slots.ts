// What can be uploaded where (section 8). Shared by the browser (early,
// friendly checks) and the server (the checks that count).

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
} as const;

export type FileSlot =
  | "issue_cover"
  | "issue_pdf"
  | "issue_docx"
  | "article_pdf"
  | "article_docx"
  | "board_photo"
  | "site_logo"
  | "site_og_image";

export interface SlotRule {
  label: string;
  bucket: "issue-covers" | "published-files" | "site-assets";
  fileRole:
    | "issue_cover"
    | "issue_pdf"
    | "issue_docx"
    | "article_pdf"
    | "article_docx"
    | "board_photo"
    | "site_asset";
  mimes: readonly string[];
  extensions: readonly string[];
  maxBytes: number;
  table: "issues" | "articles" | "editorial_board_members" | "site_settings";
  column: string;
  superAdminOnly?: boolean;
}

const MB = 1024 * 1024;
// Published files stop at 50 MB, the most Supabase's Free plan accepts for one
// upload (the published-files bucket has the same limit). On Supabase Pro both
// can be raised: docs/RUNBOOK.md, "Uploads failing".
const IMAGES = [MIME.jpeg, MIME.png, MIME.webp];

export const SLOT_RULES: Record<FileSlot, SlotRule> = {
  issue_cover: {
    label: "Cover image",
    bucket: "issue-covers",
    fileRole: "issue_cover",
    mimes: IMAGES,
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: 10 * MB,
    table: "issues",
    column: "cover_file_id",
  },
  issue_pdf: {
    label: "Full issue (PDF)",
    bucket: "published-files",
    fileRole: "issue_pdf",
    mimes: [MIME.pdf],
    extensions: [".pdf"],
    maxBytes: 50 * MB,
    table: "issues",
    column: "full_pdf_file_id",
  },
  issue_docx: {
    label: "Full issue (Word)",
    bucket: "published-files",
    fileRole: "issue_docx",
    mimes: [MIME.docx],
    extensions: [".docx"],
    maxBytes: 50 * MB,
    table: "issues",
    column: "full_docx_file_id",
  },
  article_pdf: {
    label: "Article PDF",
    bucket: "published-files",
    fileRole: "article_pdf",
    mimes: [MIME.pdf],
    extensions: [".pdf"],
    maxBytes: 50 * MB,
    table: "articles",
    column: "pdf_file_id",
  },
  article_docx: {
    label: "Article Word file",
    bucket: "published-files",
    fileRole: "article_docx",
    mimes: [MIME.docx],
    extensions: [".docx"],
    maxBytes: 50 * MB,
    table: "articles",
    column: "docx_file_id",
  },
  board_photo: {
    label: "Photo",
    bucket: "site-assets",
    fileRole: "board_photo",
    mimes: IMAGES,
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: 5 * MB,
    table: "editorial_board_members",
    column: "photo_file_id",
    superAdminOnly: true,
  },
  site_logo: {
    label: "Logo",
    bucket: "site-assets",
    fileRole: "site_asset",
    mimes: [...IMAGES, MIME.svg],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".svg"],
    maxBytes: 5 * MB,
    table: "site_settings",
    column: "logo_file_id",
    superAdminOnly: true,
  },
  site_og_image: {
    label: "Default sharing image",
    bucket: "site-assets",
    fileRole: "site_asset",
    mimes: IMAGES,
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: 5 * MB,
    table: "site_settings",
    column: "default_og_image_file_id",
    superAdminOnly: true,
  },
};

/** Site settings is a single row; its file slots use fixed entity ids for version history. */
export const SITE_ENTITY_IDS: Partial<Record<FileSlot, string>> = {
  site_logo: "00000000-0000-4000-8000-0000000000a1",
  site_og_image: "00000000-0000-4000-8000-0000000000a2",
};

/** Returns a problem description, or null if the file fits the slot. */
export function checkFile(slot: FileSlot, file: { name: string; type: string; size: number }): string | null {
  const rule = SLOT_RULES[slot];
  const name = file.name.toLowerCase();
  if (!rule.extensions.some((ext) => name.endsWith(ext))) {
    return `${rule.label} must be a ${rule.extensions.join(", ")} file.`;
  }
  if (!rule.mimes.includes(file.type))
    return `${file.name} isn't an accepted file type for ${rule.label.toLowerCase()}.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > rule.maxBytes) return `${file.name} is larger than ${Math.round(rule.maxBytes / MB)} MB.`;
  return null;
}

/** Storage-safe file name that keeps it recognisable (no slashes, no leading dots). */
export function safeFileName(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  const ext = match ? `.${match[1].toLowerCase()}` : "";
  const base = (match ? name.slice(0, match.index) : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80);
  return `${base || "file"}${ext}`;
}

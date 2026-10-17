import { publicEnv } from "@/lib/env.public";

/** Public URL of an object in a public bucket (covers, site assets). */
export function publicStorageUrl(bucket: "issue-covers" | "site-assets", path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}

/**
 * Download route for a published file. The route checks the item is
 * published, records the download and redirects to a signed URL (section 8).
 */
export function articleDownloadPath(articleId: string, format: "pdf" | "docx"): string {
  return `/api/download/article/${articleId}?format=${format}`;
}

export function issueDownloadPath(issueId: string, format: "pdf" | "docx"): string {
  return `/api/download/issue/${issueId}?format=${format}`;
}

export function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

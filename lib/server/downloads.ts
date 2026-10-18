import "server-only";
import { NextResponse } from "next/server";
import { parseName } from "@/lib/citations";
import { getPublishedIssues } from "@/lib/data/catalog";
import { fileNamePart } from "@/lib/file-names";
import { issueFileStem } from "@/lib/issue-label";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { ApiError, notFound } from "./errors";
import { logger } from "./logger";
import { recordEvent } from "./metrics";

/*
 * Download routes (section 8). Each checks the item is published, records
 * the download, then redirects to a one-minute signed URL whose
 * Content-Disposition carries a clean file name. Files are never streamed
 * through the function (item 41).
 *
 * Google Scholar (audit item 25): article pages give this route as
 * citation_pdf_url, and Scholar follows the redirect, so published PDFs are
 * not marked noindex. Streaming the bytes from the site's own domain was
 * weighed and left out: a buffered Vercel Function response is capped at
 * 4.5 MB (scanned back issues are larger); streaming every read through a
 * function costs compute time and bandwidth that the storage CDN serves for
 * free; and the site-wide X-Frame-Options: DENY would stop the inline
 * preview from framing a same-site PDF. Only Word files stay noindex.
 */

export type DownloadFormat = "pdf" | "docx";

const SIGNED_URL_SECONDS = 60;

/** Storage is down or slow: say so plainly and suggest trying again (item 87). */
const storageUnavailable = () =>
  new ApiError(
    503,
    "storage_unavailable",
    "The file store is not responding. Please try again in a few minutes.",
    {
      "Retry-After": "120",
    },
  );

async function redirectToFile(
  fileId: string,
  fileName: string,
  inline: boolean,
  format: DownloadFormat,
): Promise<Response> {
  const admin = createSupabaseAdminClient();
  const { data: file, error: lookupError } = await admin
    .from("stored_files")
    .select("bucket, path")
    .eq("id", fileId)
    .maybeSingle();
  if (lookupError) throw storageUnavailable();
  if (!file) throw notFound("This file is not available.");
  const { data, error } = await admin.storage
    .from(file.bucket)
    .createSignedUrl(file.path, SIGNED_URL_SECONDS, inline ? undefined : { download: fileName });
  if (error || !data) {
    logger.error({ err: error?.message, bucket: file.bucket }, "could not sign a download URL");
    throw storageUnavailable();
  }
  // Only published items reach this point (RLS and the published-issue list).
  // Their PDFs may be indexed; Word copies are for downloading only.
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store", ...(format === "pdf" ? {} : { "X-Robots-Tag": "noindex" }) },
  });
}

/** /api/download/article/[id]?format=pdf|docx[&inline=1] */
export async function downloadArticle(
  headers: Headers,
  articleId: string,
  format: DownloadFormat,
  inline: boolean,
): Promise<Response> {
  // The public client sees only published articles in published issues (RLS).
  const supabase = createSupabasePublicClient();
  const [{ data: article }, { data: firstAuthor }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, issue_id, pdf_file_id, docx_file_id")
      .eq("id", articleId)
      .maybeSingle(),
    supabase
      .from("public_article_authors")
      .select("full_name")
      .eq("article_id", articleId)
      .order("position")
      .limit(1)
      .maybeSingle(),
  ]);
  const issue = article && (await getPublishedIssues()).find((i) => i.id === article.issue_id);
  const fileId = format === "pdf" ? article?.pdf_file_id : article?.docx_file_id;
  if (!article || !issue || !fileId) throw notFound("This file is not available.");

  const family = firstAuthor?.full_name ? fileNamePart(parseName(firstAuthor.full_name).family) : "Article";
  const fileName = `AWLEL_${issueFileStem(issue)}_${family}_${issue.year}.${format}`;
  // Opening the inline preview is reading, not downloading.
  if (!inline) {
    await recordEvent(headers, format === "pdf" ? "download_pdf" : "download_docx", { articleId });
  }
  return redirectToFile(fileId, fileName, inline, format);
}

/** /api/download/issue/[id]?format=pdf|docx */
export async function downloadIssue(
  headers: Headers,
  issueId: string,
  format: DownloadFormat,
): Promise<Response> {
  const issue = (await getPublishedIssues()).find((i) => i.id === issueId);
  if (!issue) throw notFound("This file is not available.");
  const { data } = await createSupabaseAdminClient()
    .from("issues")
    .select("full_pdf_file_id, full_docx_file_id")
    .eq("id", issueId)
    .single();
  const fileId = format === "pdf" ? data?.full_pdf_file_id : data?.full_docx_file_id;
  if (!fileId) throw notFound("This file is not available.");

  await recordEvent(headers, format === "pdf" ? "download_pdf" : "download_docx", { issueId });
  return redirectToFile(fileId, `AWLEL_${issueFileStem(issue)}_Full_Issue.${format}`, false, format);
}

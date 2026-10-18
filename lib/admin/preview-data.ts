import "server-only";
import type { ArticleSummary, AuthorSummary, IssueSummary } from "@/lib/data/catalog";
import { issuePath, legacyLabel } from "@/lib/issue-label";
import { publicStorageUrl } from "@/lib/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAdminIssues } from "./issue-data";

/*
 * Draft previews (section 10): the same public components, fed with the
 * editor's own (RLS-checked) view of the data, so drafts look exactly as
 * they will once published. Previews are never cached or indexed.
 */

export async function previewIssueSummary(issueId: string): Promise<IssueSummary | null> {
  const supabase = await createSupabaseServerClient();
  const [all, { data }] = await Promise.all([
    loadAdminIssues(),
    supabase
      .from("issues")
      .select(
        "id, title, published_at, cover_alt, cover:stored_files!issues_cover_file_id_fkey(bucket, path)",
      )
      .eq("id", issueId)
      .maybeSingle(),
  ]);
  const meta = all.find((i) => i.id === issueId);
  if (!meta || !data) return null;
  return {
    id: meta.id,
    volumeNumber: meta.volumeNumber,
    year: meta.year,
    issueNumber: meta.issueNumber,
    month: meta.month,
    legacyNumber: meta.legacyNumber,
    title: data.title,
    publishedAt: data.published_at,
    coverUrl: data.cover ? publicStorageUrl("issue-covers", data.cover.path) : null,
    coverAlt: data.cover_alt,
    issuesInVolume: all.filter((i) => i.volumeId === meta.volumeId && !i.deleted).length || 1,
    label: meta.label,
    legacyLabel: legacyLabel(meta.legacyNumber),
    path: issuePath(meta.volumeNumber, meta.issueNumber),
  };
}

/** An article as the site will show it, plus its publishing state for the preview's notes. */
export type PreviewArticle = ArticleSummary & { status: "draft" | "published" };

export async function previewArticles(filter: {
  issueId?: string;
  articleId?: string;
}): Promise<PreviewArticle[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("articles")
    .select(
      "id, status, slug, title, abstract, first_page, last_page, published_at, issue_id, sort_order, pdf_file_id, docx_file_id, view_count, download_count, category:categories(name, slug), authors:article_authors(full_name, affiliation, orcid, email, show_email, position)",
    )
    .is("deleted_at", null)
    .order("sort_order");
  if (filter.issueId) query = query.eq("issue_id", filter.issueId);
  if (filter.articleId) query = query.eq("id", filter.articleId);
  const { data } = await query;
  return (data ?? []).map((a) => ({
    id: a.id,
    status: a.status,
    slug: a.slug,
    title: a.title,
    abstract: a.abstract,
    firstPage: a.first_page,
    lastPage: a.last_page,
    publishedAt: a.published_at,
    category: a.category,
    authors: [...a.authors]
      .sort((x, y) => x.position - y.position)
      .map((x): AuthorSummary => ({
        fullName: x.full_name,
        affiliation: x.affiliation,
        orcid: x.orcid,
        email: x.show_email ? x.email : null,
      })),
    hasPdf: Boolean(a.pdf_file_id),
    hasDocx: Boolean(a.docx_file_id),
    viewCount: a.view_count,
    downloadCount: a.download_count ?? 0,
    issueId: a.issue_id,
    sortOrder: a.sort_order,
  }));
}

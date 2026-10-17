import "server-only";
import { NextResponse } from "next/server";
import { formatApa, formatBibtex, formatMla } from "@/lib/citations";
import type { ArticleDetail, ArticleSummary, IssueSummary } from "@/lib/data/catalog";
import type { SiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { richTextToPlain } from "@/lib/sanitize";
import { articleDownloadPath, issueDownloadPath } from "@/lib/storage";

/*
 * Public read-only JSON API, version 1 (item 102), for indexers and partner
 * libraries. Only published content and public fields; author emails only
 * where the author chose to show them. Breaking changes go to /api/v1 → /api/v2,
 * never into v1. Field names are snake_case and stable.
 */

export const API_VERSION = "1";

/** CDN-cached JSON: five minutes fresh, a day stale while it refreshes. */
export function apiJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      "X-API-Version": API_VERSION,
    },
  });
}

/** CORS preflight for the public API. */
export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function issueJson(
  issue: IssueSummary,
  extra: { article_count?: number; has_pdf?: boolean; has_docx?: boolean } = {},
) {
  return {
    id: issue.id,
    volume: issue.volumeNumber,
    issue: issue.issuesInVolume > 1 ? issue.issueNumber : null,
    year: issue.year,
    month: issue.month,
    legacy_number: issue.legacyNumber,
    label: issue.label,
    title: issue.title,
    published_at: issue.publishedAt,
    cover_url: issue.coverUrl,
    url: `${siteUrl}${issue.path}`,
    api_url: `${siteUrl}/api/v1/issues/${issue.volumeNumber}/${issue.issueNumber}`,
    ...(extra.article_count !== undefined ? { article_count: extra.article_count } : {}),
    ...(extra.has_pdf !== undefined
      ? {
          full_issue_pdf_url: extra.has_pdf ? `${siteUrl}${issueDownloadPath(issue.id, "pdf")}` : null,
          full_issue_docx_url: extra.has_docx ? `${siteUrl}${issueDownloadPath(issue.id, "docx")}` : null,
        }
      : {}),
  };
}

export function articleSummaryJson(a: ArticleSummary) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    authors: a.authors.map((p) => ({ name: p.fullName, affiliation: p.affiliation, orcid: p.orcid })),
    category: a.category ? { name: a.category.name, slug: a.category.slug } : null,
    first_page: a.firstPage,
    last_page: a.lastPage,
    published_at: a.publishedAt,
    issue_id: a.issueId,
    url: `${siteUrl}/articles/${a.slug}`,
    api_url: `${siteUrl}/api/v1/articles/${a.slug}`,
    pdf_url: a.hasPdf ? `${siteUrl}${articleDownloadPath(a.id, "pdf")}` : null,
    docx_url: a.hasDocx ? `${siteUrl}${articleDownloadPath(a.id, "docx")}` : null,
    views: a.viewCount,
    downloads: a.downloadCount,
  };
}

export function articleDetailJson(a: ArticleDetail, settings: SiteSettings) {
  const citation = {
    authors: a.authors.map((p) => ({ fullName: p.fullName })),
    title: a.title,
    journal: settings.journalName,
    year: a.issue.year,
    volume: a.issue.volumeNumber,
    issue: a.issue.issuesInVolume > 1 ? a.issue.issueNumber : null,
    firstPage: a.firstPage,
    lastPage: a.lastPage,
    doi: a.doi,
    url: `${siteUrl}/articles/${a.slug}`,
    issn: settings.issn,
    publisher: settings.publisher,
    keywords: a.keywords,
  };
  return {
    ...articleSummaryJson(a),
    authors: a.authors.map((p) => ({
      name: p.fullName,
      affiliation: p.affiliation,
      orcid: p.orcid,
      email: p.email,
    })),
    abstract: richTextToPlain(a.abstract),
    abstract_html: a.abstract,
    keywords: a.keywords,
    doi: a.doi,
    citation_style: a.citationStyle,
    updated_at: a.updatedAt,
    issue: issueJson(a.issue),
    journal: { name: settings.journalName, issn: settings.issn, publisher: settings.publisher },
    cite: {
      apa: formatApa(citation).plain,
      mla: formatMla(citation).plain,
      bibtex: formatBibtex(citation),
    },
  };
}

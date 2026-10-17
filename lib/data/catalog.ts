import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { issueLabel, issuePath, legacyLabel } from "@/lib/issue-label";
import { logger } from "@/lib/server/logger";
import { publicStorageUrl } from "@/lib/storage";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { TAGS } from "./tags";

/*
 * Public catalogue reads. Every function is cached with `"use cache"` and
 * tagged, so publishing invalidates exactly what changed (items 2, 50).
 *
 * N+1 rule (item 27): lists are built from a fixed number of queries. Authors
 * for any set of articles come from ONE `in()` query, never one per article,
 * and issue labels come from the cached issue list rather than a join per row.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueSummary {
  id: string;
  volumeNumber: number;
  year: number;
  issueNumber: number;
  month: number | null;
  legacyNumber: number | null;
  title: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  issuesInVolume: number;
  label: string;
  legacyLabel: string | null;
  path: string;
}

export interface AuthorSummary {
  fullName: string;
  affiliation: string | null;
  orcid: string | null;
  email: string | null;
}

export interface CategoryRef {
  name: string;
  slug: string;
}

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  abstract: string | null;
  firstPage: number | null;
  lastPage: number | null;
  publishedAt: string | null;
  category: CategoryRef | null;
  authors: AuthorSummary[];
  hasPdf: boolean;
  hasDocx: boolean;
  viewCount: number;
  downloadCount: number;
  issueId: string;
  sortOrder: number;
}

export interface FileInfo {
  sizeBytes: number;
}

export interface IssueDetail extends IssueSummary {
  editorial: string | null;
  fullPdf: FileInfo | null;
  fullDocx: FileInfo | null;
  articles: ArticleSummary[];
  previous: IssueSummary | null;
  next: IssueSummary | null;
}

export interface ArticleDetail extends ArticleSummary {
  keywords: string[];
  doi: string | null;
  citationStyle: "apa7" | "mla8";
  pdf: FileInfo | null;
  docx: FileInfo | null;
  updatedAt: string;
  issue: IssueSummary;
}

export interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  articleCount: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const ARTICLE_COLUMNS =
  "id, slug, title, abstract, first_page, last_page, published_at, issue_id, sort_order, pdf_file_id, docx_file_id, view_count, download_count, category:categories(name, slug)";

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  abstract: string | null;
  first_page: number | null;
  last_page: number | null;
  published_at: string | null;
  issue_id: string;
  sort_order: number;
  pdf_file_id: string | null;
  docx_file_id: string | null;
  view_count: number;
  download_count: number | null;
  category: CategoryRef | null;
}

/**
 * A failed read. While building (e.g. the database has not been migrated
 * yet, or is briefly unreachable), render an empty page with a short cache
 * life so the first request after recovery fills it in; at request time,
 * fail loudly. Called inside `"use cache"` scopes before their cacheLife.
 */
function degrade<T>(what: string, error: unknown, fallback: T): T {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    logger.warn({ err: error }, `catalog: ${what} unavailable during build; rendering empty for now`);
    cacheLife("minutes");
    return fallback;
  }
  return fail(what, error);
}

function fail(what: string, error: unknown): never {
  logger.error({ err: error }, `catalog: failed to load ${what}`);
  throw new Error(`Could not load ${what}`);
}

/** One query for the authors of many articles, grouped by article id. */
async function authorsFor(articleIds: string[]): Promise<Map<string, AuthorSummary[]>> {
  const byArticle = new Map<string, AuthorSummary[]>();
  if (articleIds.length === 0) return byArticle;
  const { data, error } = await createSupabasePublicClient()
    .from("public_article_authors")
    .select("article_id, full_name, affiliation, orcid, email, position")
    .in("article_id", articleIds)
    .order("position");
  if (error) fail("authors", error);
  for (const row of data ?? []) {
    if (!row.article_id) continue;
    const list = byArticle.get(row.article_id) ?? [];
    list.push({
      fullName: row.full_name ?? "",
      affiliation: row.affiliation,
      orcid: row.orcid,
      email: row.email,
    });
    byArticle.set(row.article_id, list);
  }
  return byArticle;
}

async function toSummaries(rows: ArticleRow[]): Promise<ArticleSummary[]> {
  const authors = await authorsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    abstract: r.abstract,
    firstPage: r.first_page,
    lastPage: r.last_page,
    publishedAt: r.published_at,
    category: r.category,
    authors: authors.get(r.id) ?? [],
    hasPdf: Boolean(r.pdf_file_id),
    hasDocx: Boolean(r.docx_file_id),
    viewCount: r.view_count,
    downloadCount: r.download_count ?? 0,
    issueId: r.issue_id,
    sortOrder: r.sort_order,
  }));
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/** Every published issue, newest first, with labels. Small enough to load whole. */
export async function getPublishedIssues(): Promise<IssueSummary[]> {
  "use cache";
  cacheTag(TAGS.issues);

  const { data, error } = await createSupabasePublicClient()
    .from("issues")
    .select(
      "id, issue_number, month, legacy_number, title, published_at, cover_alt, volume:volumes!inner(volume_number, year), cover:stored_files!issues_cover_file_id_fkey(bucket, path)",
    )
    .eq("status", "published")
    .is("deleted_at", null);
  if (error) return degrade("issues", error, []);
  cacheLife("days");

  const rows = data ?? [];
  const perVolume = new Map<number, number>();
  for (const row of rows) {
    perVolume.set(row.volume.volume_number, (perVolume.get(row.volume.volume_number) ?? 0) + 1);
  }

  return rows
    .map((row): IssueSummary => {
      const issuesInVolume = perVolume.get(row.volume.volume_number) ?? 1;
      const input = {
        volumeNumber: row.volume.volume_number,
        year: row.volume.year,
        issueNumber: row.issue_number,
        month: row.month,
        legacyNumber: row.legacy_number,
        issuesInVolume,
      };
      return {
        id: row.id,
        ...input,
        title: row.title,
        publishedAt: row.published_at,
        coverUrl:
          row.cover?.bucket === "issue-covers" ? publicStorageUrl("issue-covers", row.cover.path) : null,
        coverAlt: row.cover_alt,
        label: issueLabel(input),
        legacyLabel: legacyLabel(row.legacy_number),
        path: issuePath(row.volume.volume_number, row.issue_number),
      };
    })
    .sort((a, b) => b.year - a.year || b.volumeNumber - a.volumeNumber || b.issueNumber - a.issueNumber);
}

export async function getLatestIssue(): Promise<IssueSummary | null> {
  return (await getPublishedIssues())[0] ?? null;
}

async function issueArticles(issueId: string): Promise<ArticleSummary[]> {
  "use cache";
  cacheTag(TAGS.articles, TAGS.issue(issueId));
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("issue_id", issueId)
    .order("sort_order")
    .order("first_page", { nullsFirst: false });
  if (error) return degrade("issue articles", error, []);
  cacheLife("days");
  return toSummaries((data ?? []) as ArticleRow[]);
}

export async function getIssue(volumeNumber: number, issueNumber: number): Promise<IssueDetail | null> {
  "use cache";
  cacheTag(TAGS.issues);

  const issues = await getPublishedIssues();
  const index = issues.findIndex((i) => i.volumeNumber === volumeNumber && i.issueNumber === issueNumber);
  if (index === -1) return null;
  const summary = issues[index];
  cacheTag(TAGS.issue(summary.id));

  const { data, error } = await createSupabasePublicClient()
    .from("issues")
    .select(
      "editorial, full_pdf:stored_files!issues_full_pdf_file_id_fkey(size_bytes), full_docx:stored_files!issues_full_docx_file_id_fkey(size_bytes)",
    )
    .eq("id", summary.id)
    .single();
  if (error) return degrade("issue", error, null);
  cacheLife("days");

  return {
    ...summary,
    editorial: data.editorial,
    fullPdf: data.full_pdf ? { sizeBytes: data.full_pdf.size_bytes } : null,
    fullDocx: data.full_docx ? { sizeBytes: data.full_docx.size_bytes } : null,
    articles: await issueArticles(summary.id),
    // The list is newest first, so "previous" (older) is the next index.
    previous: issues[index + 1] ?? null,
    next: issues[index - 1] ?? null,
  };
}

export async function getIssueArticles(issueId: string): Promise<ArticleSummary[]> {
  return issueArticles(issueId);
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export type ArticleLookup = { article: ArticleDetail } | { redirectTo: string } | null;

export async function getArticleBySlug(slug: string): Promise<ArticleLookup> {
  "use cache";
  cacheTag(TAGS.articles);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("articles")
    .select(
      `${ARTICLE_COLUMNS}, keywords, doi, citation_style, updated_at, pdf:stored_files!articles_pdf_file_id_fkey(size_bytes), docx:stored_files!articles_docx_file_id_fkey(size_bytes)`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) return degrade("article", error, null);
  cacheLife("days");

  if (!data) {
    // Renamed articles keep their old URLs (section 11).
    const { data: redirect } = await supabase
      .from("slug_redirects")
      .select("article:articles(slug)")
      .eq("old_slug", slug)
      .maybeSingle();
    return redirect?.article?.slug ? { redirectTo: redirect.article.slug } : null;
  }

  cacheTag(TAGS.article(data.id));
  const issue = (await getPublishedIssues()).find((i) => i.id === data.issue_id);
  if (!issue) return null;
  const [summary] = await toSummaries([data as ArticleRow]);

  return {
    article: {
      ...summary,
      keywords: data.keywords,
      doi: data.doi,
      citationStyle: data.citation_style,
      pdf: data.pdf ? { sizeBytes: data.pdf.size_bytes } : null,
      docx: data.docx ? { sizeBytes: data.docx.size_bytes } : null,
      updatedAt: data.updated_at,
      issue,
    },
  };
}

/** Slugs for build-time prerendering. */
export async function getPublishedArticleSlugs(): Promise<string[]> {
  "use cache";
  cacheTag(TAGS.articles);
  const { data, error } = await createSupabasePublicClient().from("articles").select("slug");
  if (error) return degrade("article slugs", error, []);
  cacheLife("days");
  return (data ?? []).map((r) => r.slug);
}

export type PopularMetric = "views" | "downloads";

export async function getPopularArticles(metric: PopularMetric, limit = 5): Promise<ArticleSummary[]> {
  "use cache";
  cacheTag(TAGS.articles);
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .order(metric === "views" ? "view_count" : "download_count", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) return degrade("popular articles", error, []);
  cacheLife("hours");
  return toSummaries((data ?? []) as ArticleRow[]);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  "use cache";
  cacheTag(TAGS.categories, TAGS.articles);
  const { data, error } = await createSupabasePublicClient().rpc("categories_with_counts");
  if (error) return degrade("categories", error, []);
  cacheLife("days");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    articleCount: Number(c.article_count),
  }));
}

export async function getCategoryArticles(slug: string): Promise<{
  category: CategoryWithCount;
  articles: ArticleSummary[];
} | null> {
  "use cache";
  cacheTag(TAGS.categories, TAGS.articles);
  const category = (await getCategoriesWithCounts()).find((c) => c.slug === slug);
  if (!category) return null;
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("category_id", category.id)
    .order("published_at", { ascending: false })
    .order("sort_order");
  if (error) return degrade("category articles", error, null);
  cacheLife("days");
  return { category, articles: await toSummaries((data ?? []) as ArticleRow[]) };
}

/** Published article count per issue id (one query). */
export async function getArticleCountsByIssue(): Promise<Record<string, number>> {
  "use cache";
  cacheTag(TAGS.articles);
  const { data, error } = await createSupabasePublicClient().from("articles").select("issue_id");
  if (error) return degrade("article counts", error, {});
  cacheLife("days");
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.issue_id] = (counts[row.issue_id] ?? 0) + 1;
  return counts;
}

/** Summaries for a set of article ids (search results), in the given order. */
export async function getArticlesByIds(ids: string[]): Promise<ArticleSummary[]> {
  "use cache";
  cacheTag(TAGS.articles);
  if (ids.length === 0) return [];
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .in("id", ids);
  if (error) return degrade("articles", error, []);
  cacheLife("hours");
  const summaries = await toSummaries((data ?? []) as ArticleRow[]);
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is ArticleSummary => Boolean(s));
}

// ---------------------------------------------------------------------------
// Discovery (sitemap, RSS)
// ---------------------------------------------------------------------------

export interface SitemapArticle {
  slug: string;
  updatedAt: string;
}

/** Every published article's URL and last change, for sitemap.xml. */
export async function getSitemapArticles(): Promise<SitemapArticle[]> {
  "use cache";
  cacheTag(TAGS.articles);
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select("slug, updated_at")
    .order("published_at", { ascending: false });
  if (error) return degrade("sitemap articles", error, []);
  cacheLife("days");
  return (data ?? []).map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}

/** The newest published articles, for the RSS feed. */
export async function getLatestArticles(limit = 30): Promise<ArticleSummary[]> {
  "use cache";
  cacheTag(TAGS.articles);
  const { data, error } = await createSupabasePublicClient()
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .order("published_at", { ascending: false })
    .order("sort_order")
    .limit(limit);
  if (error) return degrade("latest articles", error, []);
  cacheLife("days");
  return toSummaries((data ?? []) as ArticleRow[]);
}

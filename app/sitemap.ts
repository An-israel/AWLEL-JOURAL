import type { MetadataRoute } from "next";
import { getCategoriesWithCounts, getPublishedIssues, getSitemapArticles } from "@/lib/data/catalog";
import { siteUrl } from "@/lib/env.public";

// Every published issue and article (section 11). Cached under the catalogue
// tags, so publishing or unpublishing refreshes it (item 50).
const STATIC_PAGES = [
  "/",
  "/issues",
  "/scope",
  "/submission-guidelines",
  "/editorial-board",
  "/about",
  "/department",
  "/contact",
  "/privacy",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [issues, articles, categories] = await Promise.all([
    getPublishedIssues(),
    getSitemapArticles(),
    getCategoriesWithCounts(),
  ]);
  return [
    ...STATIC_PAGES.map((path) => ({
      url: `${siteUrl}${path === "/" ? "" : path}`,
      changeFrequency: path === "/" || path === "/issues" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "/" ? 1 : 0.6,
    })),
    ...issues.map((issue) => ({
      url: `${siteUrl}${issue.path}`,
      lastModified: issue.publishedAt ?? undefined,
      changeFrequency: "yearly" as const,
      priority: 0.8,
    })),
    ...articles.map((article) => ({
      url: `${siteUrl}/articles/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.9,
    })),
    ...categories
      .filter((c) => c.articleCount > 0)
      .map((c) => ({
        url: `${siteUrl}/categories/${c.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
  ];
}

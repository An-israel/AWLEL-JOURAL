import { authorLine } from "@/components/catalog/author-names";
import { getLatestArticles, getPublishedIssues } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { richTextToPlain } from "@/lib/sanitize";

// RSS 2.0 feed of the latest articles (section 11), at /feed.xml.

function xml(value: string): string {
  return (
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // Characters XML 1.0 forbids.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

export async function GET() {
  const [articles, issues, settings] = await Promise.all([
    getLatestArticles(30),
    getPublishedIssues(),
    getSiteSettings(),
  ]);
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const items = articles.map((a) => {
    const url = `${siteUrl}/articles/${a.slug}`;
    const issue = issueById.get(a.issueId);
    const abstract = richTextToPlain(a.abstract);
    const description = [authorLine(a.authors), issue?.label, abstract].filter(Boolean).join(" — ");
    return `    <item>
      <title>${xml(a.title)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      ${a.publishedAt ? `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>` : ""}
      ${a.authors.map((p) => `<dc:creator>${xml(p.fullName)}</dc:creator>`).join("")}
      ${a.category ? `<category>${xml(a.category.name)}</category>` : ""}
      <description>${xml(description)}</description>
    </item>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(`${settings.shortName}: ${settings.journalName}`)}</title>
    <link>${xml(siteUrl)}</link>
    <atom:link href="${xml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>${xml(`Latest articles from ${settings.journalName} (ISSN ${settings.issn}).`)}</description>
    <language>en</language>
    <copyright>${xml(`© ${settings.publisher}`)}</copyright>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

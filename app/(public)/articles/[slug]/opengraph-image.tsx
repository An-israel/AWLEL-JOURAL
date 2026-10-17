import { authorLine } from "@/components/catalog/author-names";
import { getArticleBySlug, getPublishedArticleSlugs } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { brandedImage, OG_SIZE } from "@/lib/seo/og-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Article in AWLEL: African, World Literature and English Language";

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [result, settings] = await Promise.all([getArticleBySlug(slug), getSiteSettings()]);
  const article = result && "article" in result ? result.article : null;
  return brandedImage({
    eyebrow: article?.category?.name ?? "Research article",
    title: article?.title ?? settings.journalName,
    lines: article ? [authorLine(article.authors), article.issue.label] : [],
    footer: `${settings.shortName} · ${settings.journalName} · ISSN ${settings.issn}`,
  });
}

import { authorLine } from "@/components/catalog/author-names";
import { getArticleBySlug, getPublishedArticleSlugs } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { brandedImage, OG_SIZE } from "@/lib/seo/og-image";
import { SITE_DEFAULTS } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = "image/png";
// A static export: it cannot read Settings, so it names the journal from the
// built-in defaults (lib/site.ts), the one place the name is hard-coded.
export const alt = `Article in ${SITE_DEFAULTS.shortName}: ${SITE_DEFAULTS.journalName}`;

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

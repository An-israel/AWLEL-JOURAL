import { getIssue, getPublishedIssues } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { brandedImage, OG_SIZE } from "@/lib/seo/og-image";
import { plural } from "@/lib/plural";
import { SITE_DEFAULTS } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = "image/png";
// A static export: it cannot read Settings, so it names the journal from the
// built-in defaults (lib/site.ts), the one place the name is hard-coded.
export const alt = `Issue of ${SITE_DEFAULTS.shortName}: ${SITE_DEFAULTS.journalName}`;

export async function generateStaticParams() {
  const issues = await getPublishedIssues();
  const params = issues.map((i) => ({ volume: String(i.volumeNumber), issue: String(i.issueNumber) }));
  return params.length > 0 ? params : [{ volume: "0", issue: "0" }];
}

export default async function Image({ params }: { params: Promise<{ volume: string; issue: string }> }) {
  const { volume, issue: number } = await params;
  const [issue, settings] = await Promise.all([
    /^\d{1,4}$/.test(volume) && /^\d{1,4}$/.test(number) ? getIssue(Number(volume), Number(number)) : null,
    getSiteSettings(),
  ]);
  return brandedImage({
    eyebrow: issue?.legacyLabel ? `${settings.shortName} · ${issue.legacyLabel}` : settings.shortName,
    title: issue?.label ?? settings.journalName,
    lines: issue ? [issue.title ?? plural(issue.articles.length, "article")] : [],
    footer: `${settings.journalName} · ISSN ${settings.issn}`,
    coverUrl: issue?.coverUrl,
  });
}

import { getIssue, getPublishedIssues } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { brandedImage, OG_SIZE } from "@/lib/seo/og-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Issue of AWLEL: African, World Literature and English Language";

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
    lines: issue ? [issue.title ?? `${issue.articles.length} articles`] : [],
    footer: `${settings.journalName} · ISSN ${settings.issn}`,
    coverUrl: issue?.coverUrl,
  });
}

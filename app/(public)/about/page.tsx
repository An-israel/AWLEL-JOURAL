import Link from "next/link";
import { AsideCard, StaticPage } from "@/components/pages/static-page";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getPage } from "@/lib/data/pages";
import { getSiteSettings } from "@/lib/data/site-settings";

export const generateMetadata = () => staticPageMetadata("about", "About the Journal");

export default async function AboutPage() {
  const [page, settings] = await Promise.all([getPage("about"), getSiteSettings()]);

  return (
    <StaticPage
      eyebrow="About the Journal"
      title={page?.title ?? "About the Journal"}
      lead={
        <p>
          <em>{settings.journalName}</em> — {settings.subtitle}.
        </p>
      }
      content={page?.content ?? null}
      aside={
        <>
          <AsideCard title="Journal facts">
            <dl className="space-y-3">
              <div>
                <dt className="text-xs tracking-wide uppercase">ISSN</dt>
                <dd className="font-medium text-ink">{settings.issn}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide uppercase">Founded</dt>
                <dd className="font-medium text-ink">2001 (as AWL)</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide uppercase">Publisher</dt>
                <dd className="font-medium text-ink">{settings.publisher}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide uppercase">Access</dt>
                <dd className="font-medium text-ink">Open access: free to read and download</dd>
              </div>
            </dl>
          </AsideCard>
          <AsideCard title="Explore">
            <ul className="space-y-2">
              <li>
                <Link href="/editorial-board">Editorial Board</Link>
              </li>
              <li>
                <Link href="/scope">Aims and Scope</Link>
              </li>
              <li>
                <Link href="/department">The Department</Link>
              </li>
            </ul>
          </AsideCard>
        </>
      }
    />
  );
}

import { AsideCard, StaticPage } from "@/components/pages/static-page";
import { SubmissionRoutes } from "@/components/site/submission-routes";
import { getSiteSettings } from "@/lib/data/site-settings";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getPage } from "@/lib/data/pages";

export const generateMetadata = () => staticPageMetadata("submission-guidelines", "Submission Guidelines");

export default async function GuidelinesPage() {
  const [page, settings] = await Promise.all([getPage("submission-guidelines"), getSiteSettings()]);

  return (
    <StaticPage
      eyebrow="For authors"
      title={page?.title ?? "Submission Guidelines"}
      content={page?.content ?? null}
      afterContent={
        <div className="mt-14 max-w-[70ch]">
          <SubmissionRoutes email={settings.contactEmail} />
        </div>
      }
      aside={
        <>
          <AsideCard title="At a glance">
            <ul className="space-y-2">
              <li>Submit online or by email</li>
              <li>Word document (.docx)</li>
              <li>Indented paragraphing</li>
              <li>MLA 8th (Works Cited) or APA 7th (References), never both</li>
            </ul>
          </AsideCard>
          <AsideCard title="Questions?">
            <p>
              Write to the editorial office:
              <a href={`mailto:${settings.contactEmail}`} className="mt-1 block font-medium break-words">
                {settings.contactEmail}
              </a>
            </p>
          </AsideCard>
        </>
      }
    />
  );
}

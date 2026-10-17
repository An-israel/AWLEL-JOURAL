import Link from "next/link";
import { AsideCard, StaticPage } from "@/components/pages/static-page";
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
        <section
          aria-labelledby="submit-cta"
          className="relative mt-14 max-w-[70ch] overflow-hidden rounded-xl bg-navy p-8 text-white"
        >
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-1/4 opacity-90"
            style={{ clipPath: "polygon(55% 0, 100% 0, 100% 100%, 0 100%)" }}
          >
            <div className="accent-bands h-full w-full" />
          </div>
          <div className="relative max-w-md">
            <h2 id="submit-cta" className="text-2xl text-white">
              Submit your manuscript
            </h2>
            <p className="mt-3 text-white/85">
              Sign in or create an author account, complete the form and upload your manuscript as a .docx
              file. You can follow its progress from your account.
            </p>
            <Link
              href="/submit"
              className="mt-6 inline-block rounded-md bg-white px-5 py-3 font-medium text-navy no-underline hover:bg-gold-light"
            >
              Submit your manuscript
            </Link>
          </div>
        </section>
      }
      aside={
        <>
          <AsideCard title="At a glance">
            <ul className="space-y-2">
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

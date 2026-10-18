import Link from "next/link";
import { SubjectGrid } from "@/components/catalog/subject-grid";
import { AsideCard, StaticPage } from "@/components/pages/static-page";
import { getCategoriesWithCounts } from "@/lib/data/catalog";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getPage } from "@/lib/data/pages";

export const generateMetadata = () => staticPageMetadata("scope", "Aims and Scope");

export default async function ScopePage() {
  const [page, categories] = await Promise.all([getPage("scope"), getCategoriesWithCounts()]);

  return (
    <StaticPage
      eyebrow="Scope"
      title={page?.title ?? "Aims and Scope"}
      content={page?.content ?? null}
      afterContent={
        <section aria-labelledby="subject-areas" className="mt-14 max-w-[70ch]">
          <h2 id="subject-areas" className="border-t border-line pt-5 text-2xl">
            Subject areas
          </h2>
          <SubjectGrid categories={categories} />
        </section>
      }
      aside={
        <AsideCard title="Ready to submit?">
          <p>Read the submission guidelines, then send your manuscript as a Word document.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/submission-guidelines" className="font-semibold">
              Submission guidelines →
            </Link>
            <Link
              href="/submit"
              className="rounded-md bg-navy px-4 py-2.5 text-center font-medium text-white no-underline hover:bg-royal"
            >
              Submit a manuscript
            </Link>
          </div>
        </AsideCard>
      }
    />
  );
}

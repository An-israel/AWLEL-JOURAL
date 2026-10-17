import Link from "next/link";
import { categoryTint } from "@/components/catalog/category-tag";
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
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-line bg-white p-4 no-underline transition-colors hover:border-navy"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink group-hover:text-navy">{c.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryTint(c.slug)}`}>
                      {c.articleCount}
                    </span>
                  </span>
                  {c.description ? (
                    <span className="mt-1.5 text-sm text-ink-muted">{c.description}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
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

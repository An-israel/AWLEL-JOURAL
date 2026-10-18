import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { SubjectGrid } from "@/components/catalog/subject-grid";
import { getCategoriesWithCounts } from "@/lib/data/catalog";
import { DEFAULT_OG_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Subject areas",
  description: "Browse AWLEL articles by subject area, with the number of articles in each.",
  alternates: { canonical: "/categories" },
  openGraph: { title: "Subject areas — AWLEL", url: "/categories", images: DEFAULT_OG_IMAGE },
};

/** Every subject area with its article count (item 30). */
export default async function CategoriesPage() {
  const categories = await getCategoriesWithCounts();

  return (
    <div className="mx-auto max-w-site px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Categories" }]} />
      <header className="mt-10 max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Categories</p>
        <h1 className="mt-2 text-4xl sm:text-5xl">Subject areas</h1>
        <hr className="rule-gold mt-6 w-20" />
        <p className="prose-reading mt-6 text-ink-muted">
          Every article in the journal is filed under one subject area. Choose a subject to see its articles,
          or read the journal’s <Link href="/scope">aims and scope</Link>.
        </p>
      </header>
      <section aria-label="Subject areas" className="mt-6 max-w-4xl">
        {categories.length > 0 ? (
          <SubjectGrid categories={categories} />
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink-muted">
            No subject areas have been set up yet.
          </p>
        )}
      </section>
    </div>
  );
}

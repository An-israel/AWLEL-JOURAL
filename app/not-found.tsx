import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/site/skip-link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section className="mx-auto max-w-site px-4 py-24 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold tracking-[0.2em] text-coral-ink uppercase">Error 404</p>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">This page could not be found</h1>
          <hr className="rule-gold mt-8 w-24" />
          <p className="prose-reading mt-6 text-ink-muted">
            The page may have moved, or the address may be mistyped. You can browse every issue in the archive
            or search for an article by title, author or keyword.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/issues"
              className="rounded-md bg-navy px-5 py-3 font-medium text-white no-underline hover:bg-royal"
            >
              Browse the archive
            </Link>
            <Link
              href="/search"
              className="rounded-md border border-navy px-5 py-3 font-medium text-navy no-underline hover:bg-navy hover:text-white"
            >
              Search the journal
            </Link>
            <Link href="/" className="px-2 py-3 font-medium text-navy">
              Go to the home page
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

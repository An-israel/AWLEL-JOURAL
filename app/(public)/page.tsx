import Link from "next/link";
import { getSiteSettings } from "@/lib/data/site-settings";

// Milestone 1 shell: brand hero only. Milestone 2 adds the latest issue,
// categories, most-read articles and the cover strip from the database.
export default async function HomePage() {
  const settings = await getSiteSettings();

  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[44%] lg:block"
        style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)" }}
      >
        <div className="accent-bands h-full w-full opacity-95" />
      </div>
      <div className="relative mx-auto grid max-w-site gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-medium tracking-[0.16em] text-coral-ink uppercase">
            {settings.subtitle}
          </p>
          <h1 className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-ink sm:text-5xl lg:text-display">
            {settings.journalName}
          </h1>
          <hr className="rule-gold mt-8 w-24" />
          <p className="mt-6 max-w-xl font-serif text-reading text-ink-muted">
            A forum for scholars publishing on the African literary and linguistic experience and on issues in
            global English language and literary studies. Published since 2001 by the {settings.publisher}.
          </p>
          <p className="mt-4 text-sm font-medium text-ink-muted">ISSN {settings.issn}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/issues"
              className="rounded-md bg-navy px-6 py-3 font-medium text-white no-underline shadow-sm transition-colors hover:bg-royal"
            >
              Read the latest issue
            </Link>
            <Link
              href="/submit"
              className="rounded-md border border-navy px-6 py-3 font-medium text-navy no-underline transition-colors hover:bg-navy hover:text-white"
            >
              Submit a manuscript
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { AccountLink } from "./account-link";
import { LogoMark } from "./logo";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { SearchDialog } from "./search-dialog";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 shadow-[0_1px_0_var(--line)]">
      <div className="accent-bands h-1.5" aria-hidden />
      <div className="bg-white">
        <div className="mx-auto flex max-w-site items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3 no-underline"
            aria-label="AWLEL — African, World Literature and English Language, home"
          >
            <LogoMark className="size-11 shrink-0 text-navy sm:size-12" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-2xl leading-none font-bold tracking-tight text-navy sm:text-[1.7rem]">
                  AWLEL
                </span>
                <span className="rounded-sm bg-coral-ink px-1.5 py-0.5 text-[0.65rem] leading-none font-bold tracking-[0.18em] text-white uppercase">
                  Journal
                </span>
              </span>
              <span className="mt-1 hidden truncate text-[0.8rem] text-ink-muted md:block">
                African, World Literature and English Language
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <SearchDialog />
            <AccountLink />
            <Link
              href="/submit"
              className="hidden rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline shadow-sm transition-colors hover:bg-royal sm:inline-block"
            >
              Submit a Manuscript
            </Link>
            <MobileNav />
          </div>
        </div>
      </div>
      <MainNav />
    </header>
  );
}

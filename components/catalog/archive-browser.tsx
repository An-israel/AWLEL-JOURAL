"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export interface YearGroup {
  year: number;
  issueCount: number;
  content: ReactNode;
}

/**
 * Year filter + jump-to-year for the archive. The groups are rendered on the
 * server; this only shows/hides them, so the page stays static.
 */
export function ArchiveBrowser({ groups }: { groups: YearGroup[] }) {
  const [year, setYear] = useState<number | "all">("all");
  const visible = year === "all" ? groups : groups.filter((g) => g.year === year);

  return (
    <div className="lg:grid lg:grid-cols-[12rem_1fr] lg:gap-12">
      <aside className="mb-8 lg:mb-0" aria-label="Filter the archive">
        <div className="lg:sticky lg:top-40">
          <label
            htmlFor="archive-year"
            className="text-xs font-semibold tracking-[0.16em] text-ink-muted uppercase"
          >
            Year
          </label>
          <select
            id="archive-year"
            value={year}
            onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="mt-2 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-ink focus-visible:border-royal"
          >
            <option value="all">All years</option>
            {groups.map((g) => (
              <option key={g.year} value={g.year}>
                {g.year}
              </option>
            ))}
          </select>
          {year === "all" && groups.length > 1 ? (
            <nav aria-label="Jump to year" className="mt-6 hidden lg:block">
              <p className="text-xs font-semibold tracking-[0.16em] text-ink-muted uppercase">Jump to</p>
              <ul className="mt-2 grid grid-cols-3 gap-1">
                {groups.map((g) => (
                  <li key={g.year}>
                    <a
                      href={`#year-${g.year}`}
                      className="block rounded px-2 py-1 text-sm text-navy no-underline hover:bg-white hover:underline"
                    >
                      {g.year}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </aside>
      <div className="space-y-6" aria-live="polite">
        {visible.map((g) => {
          // Years alternate between a soft blue-grey and a soft cream band, so
          // each one reads as its own section. The colour follows the year,
          // not the filter, so a year keeps its colour.
          const cream = groups.indexOf(g) % 2 === 1;
          return (
            <section
              key={g.year}
              id={`year-${g.year}`}
              aria-labelledby={`year-${g.year}-title`}
              className={`scroll-mt-40 rounded-xl border-l-4 px-5 pt-5 pb-6 sm:px-8 sm:pt-6 ${
                cream ? "border-gold bg-[#FBF5E9]" : "border-navy bg-[#EDF1F9]"
              }`}
            >
              <div className="flex items-baseline gap-4 border-b border-black/10 pb-3">
                <h2 id={`year-${g.year}-title`} className="text-3xl font-bold text-navy">
                  {g.year}
                </h2>
                <span className="text-sm text-ink-muted">
                  {g.issueCount} {g.issueCount === 1 ? "issue" : "issues"}
                </span>
              </div>
              {g.content}
            </section>
          );
        })}
      </div>
    </div>
  );
}

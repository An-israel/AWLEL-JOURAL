import type { Metadata } from "next";
import Link from "next/link";
import { plural } from "@/lib/plural";
import { ArchiveBrowser, type YearGroup } from "@/components/catalog/archive-browser";
import { IssueCover } from "@/components/catalog/issue-cover";
import { getArticleCountsByIssue, getPublishedIssues, type IssueSummary } from "@/lib/data/catalog";

export const metadata: Metadata = {
  title: "Journal Archive",
  description:
    "Every issue of AWLEL: African, World Literature and English Language, from 2001 to the present.",
  alternates: { canonical: "/issues" },
};

export default async function ArchivePage() {
  const [issues, counts] = await Promise.all([getPublishedIssues(), getArticleCountsByIssue()]);

  const byYear = new Map<number, IssueSummary[]>();
  for (const issue of issues) byYear.set(issue.year, [...(byYear.get(issue.year) ?? []), issue]);

  const groups: YearGroup[] = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({
      year,
      issueCount: list.length,
      content: (
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
          {[...list]
            .sort((a, b) => a.issueNumber - b.issueNumber)
            .map((issue) => (
              <li key={issue.id}>
                <Link href={issue.path} className="group block no-underline">
                  <IssueCover
                    issue={issue}
                    sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 45vw"
                    className="transition-transform duration-300 group-hover:-translate-y-1"
                  />
                  <span className="mt-4 block font-semibold text-ink group-hover:text-navy">
                    {issue.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {[issue.legacyLabel, plural(counts[issue.id] ?? 0, "article")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      ),
    }));

  return (
    <div className="mx-auto max-w-site px-4 py-14 sm:px-6 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Journal Archive</p>
        <h1 className="mt-2 text-4xl sm:text-5xl">All issues</h1>
        <hr className="rule-gold mt-6 w-20" />
        <p className="prose-reading mt-6 text-ink-muted">
          Every published volume of AWLEL, newest first. Each volume corresponds to a year; some years have
          more than one issue. All articles are free to read and download.
        </p>
      </header>
      <div className="mt-12">
        {groups.length > 0 ? (
          <ArchiveBrowser groups={groups} />
        ) : (
          <p className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink-muted">
            No issues have been published yet.
          </p>
        )}
      </div>
    </div>
  );
}

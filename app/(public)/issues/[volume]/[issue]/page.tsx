import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ArticleRow } from "@/components/catalog/article-row";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { DownloadLinks } from "@/components/catalog/download-links";
import { IssueCover } from "@/components/catalog/issue-cover";
import { RichText } from "@/components/catalog/rich-text";
import { JsonLd } from "@/components/seo/json-ld";
import { getIssue, getPublishedIssues, type IssueDetail } from "@/lib/data/catalog";
import { findIssueRedirect } from "@/lib/data/redirects";
import { getSiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { plural } from "@/lib/plural";
import { issueLd } from "@/lib/seo/json-ld";
import { issueDownloadPath } from "@/lib/storage";

type Props = PageProps<"/issues/[volume]/[issue]">;

function parse(value: string): number | null {
  return /^\d{1,4}$/.test(value) ? Number(value) : null;
}

async function load(params: Props["params"]) {
  const { volume, issue } = await params;
  const v = parse(volume);
  const i = parse(issue);
  return v && i ? getIssue(v, i) : null;
}

// The first visit to an address that wasn't prerendered waits for the real
// page instead of a shared fallback, so a missing item gets a true 404
// status rather than a 200 (item 20).
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const issues = await getPublishedIssues();
  const params = issues.map((i) => ({ volume: String(i.volumeNumber), issue: String(i.issueNumber) }));
  // Cache Components needs at least one entry to validate the route.
  return params.length > 0 ? params : [{ volume: "0", issue: "0" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [issue, settings] = await Promise.all([load(params), getSiteSettings()]);
  if (!issue) return { title: "Issue not found" };
  const description = `${plural(issue.articles.length, "article")} in ${issue.label} of ${settings.shortName}: ${settings.journalName}.`;
  const title = `${settings.shortName} ${issue.label}`;
  return {
    title: issue.label,
    description,
    alternates: { canonical: issue.path },
    openGraph: { title, description, url: issue.path },
    twitter: { card: "summary_large_image", title, description },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

async function IssueContent({ issue }: { issue: IssueDetail }) {
  const settings = await getSiteSettings();
  const structured = issueLd(
    {
      name: settings.journalName,
      shortName: settings.shortName,
      issn: settings.issn,
      publisher: settings.publisher,
      url: siteUrl,
    },
    {
      volume: issue.volumeNumber,
      issue: issue.issuesInVolume > 1 ? issue.issueNumber : null,
      year: issue.year,
      label: issue.label,
      url: `${siteUrl}${issue.path}`,
      datePublished: issue.publishedAt,
      imageUrl: issue.coverUrl,
    },
    issue.articles.map((a) => ({ title: a.title, url: `${siteUrl}/articles/${a.slug}` })),
  );

  return (
    <>
      <JsonLd data={structured} />
      <div className="bg-white">
        <div className="mx-auto max-w-site px-4 pt-8 pb-14 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { href: "/issues", label: "Journal Archive" },
              { href: `/issues#year-${issue.year}`, label: String(issue.year) },
              { label: issue.label },
            ]}
          />
          <div className="mt-8 grid gap-10 md:grid-cols-[15rem_1fr] lg:grid-cols-[17rem_1fr] lg:gap-14">
            <div className="mx-auto w-48 md:mx-0 md:w-full">
              <IssueCover
                issue={issue}
                priority
                sizes="(min-width: 1024px) 272px, (min-width: 768px) 240px, 192px"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">
                {issue.legacyLabel ? `${issue.legacyLabel} · ` : ""}Issue
              </p>
              <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl">{issue.label}</h1>
              {issue.title ? <p className="mt-3 text-lg text-ink-muted">{issue.title}</p> : null}
              <hr className="rule-gold mt-6 w-20" />
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
                {issue.publishedAt ? (
                  <div>
                    <dt className="text-ink-muted">Published</dt>
                    <dd className="font-medium">{dateFormat.format(new Date(issue.publishedAt))}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-ink-muted">Articles</dt>
                  <dd className="font-medium">{issue.articles.length}</dd>
                </div>
              </dl>
              <div className="mt-8 max-w-md">
                <DownloadLinks
                  variant="large"
                  options={[
                    issue.fullPdf && {
                      href: issueDownloadPath(issue.id, "pdf"),
                      label: "Download full issue (PDF)",
                      format: "PDF",
                      sizeBytes: issue.fullPdf.sizeBytes,
                    },
                    issue.fullDocx && {
                      href: issueDownloadPath(issue.id, "docx"),
                      label: "Download full issue (Word)",
                      format: "Word",
                      sizeBytes: issue.fullDocx.sizeBytes,
                    },
                  ]}
                />
              </div>
              {issue.editorial ? (
                <details
                  className="group mt-8 max-w-[70ch] rounded-lg border border-line bg-paper/60 open:bg-white"
                  open
                >
                  <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-navy [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Editorial
                  </summary>
                  <RichText html={issue.editorial} className="prose-reading px-5 pb-5" />
                </details>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-site px-4 pt-14 sm:px-6 lg:px-8" aria-labelledby="contents-title">
        <div className="flex items-baseline justify-between border-b-2 border-navy pb-3">
          <h2 id="contents-title" className="text-2xl">
            Contents
          </h2>
          <span className="text-sm text-ink-muted">{plural(issue.articles.length, "article")}</span>
        </div>
        {issue.articles.length > 0 ? (
          <div className="divide-y divide-line">
            {issue.articles.map((article) => (
              <ArticleRow key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-ink-muted">The articles in this issue are being prepared.</p>
        )}
      </section>

      <nav aria-label="Issue navigation" className="mx-auto mt-14 max-w-site px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
          {issue.previous ? (
            <Link
              href={issue.previous.path}
              rel="prev"
              className="group rounded-lg border border-line bg-white p-5 no-underline hover:border-navy"
            >
              <span className="text-sm text-ink-muted">← Previous issue</span>
              <span className="mt-1 block font-semibold text-ink group-hover:text-navy">
                {issue.previous.label}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {issue.next ? (
            <Link
              href={issue.next.path}
              rel="next"
              className="group rounded-lg border border-line bg-white p-5 text-right no-underline hover:border-navy"
            >
              <span className="text-sm text-ink-muted">Next issue →</span>
              <span className="mt-1 block font-semibold text-ink group-hover:text-navy">
                {issue.next.label}
              </span>
            </Link>
          ) : null}
        </div>
      </nav>
    </>
  );
}

function IssueSkeleton() {
  return (
    <div
      className="mx-auto min-h-[100svh] max-w-site animate-pulse px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading issue"
    >
      <div className="grid gap-10 md:grid-cols-[15rem_1fr]">
        <div className="aspect-[210/297] rounded bg-line" />
        <div className="space-y-4">
          <div className="h-10 w-2/3 rounded bg-line" />
          <div className="h-4 w-1/3 rounded bg-line" />
          <div className="h-24 rounded bg-line" />
        </div>
      </div>
    </div>
  );
}

export default async function IssuePage({ params }: Props) {
  // Checked before anything streams, so a missing issue gets a real 404
  // status rather than a 200 page (item 20). The lookup is cached.
  const issue = await load(params);
  if (!issue) {
    // A renumbered issue keeps its old address (item 74).
    const p = await params;
    const moved = await findIssueRedirect(p.volume, p.issue);
    if (moved) permanentRedirect(moved);
    notFound();
  }

  return (
    <Suspense fallback={<IssueSkeleton />}>
      <IssueContent issue={issue} />
    </Suspense>
  );
}

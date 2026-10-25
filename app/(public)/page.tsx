import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArticleRow } from "@/components/catalog/article-row";
import { authorLine } from "@/components/catalog/author-names";
import { IssueCover } from "@/components/catalog/issue-cover";
import { SectionHeading } from "@/components/catalog/section-heading";
import { JsonLd } from "@/components/seo/json-ld";
import { EditableRichText, EditableText, HomeEditProvider } from "@/components/site/home-edit";
import {
  getCategoriesWithCounts,
  getIssueArticles,
  getPopularArticles,
  getPublishedIssues,
  type ArticleSummary,
} from "@/lib/data/catalog";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { getSiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { plural } from "@/lib/plural";
import { sanitizeRichText } from "@/lib/sanitize";
import { periodicalLd } from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [settings, issues, categories, flags] = await Promise.all([
    getSiteSettings(),
    getPublishedIssues(),
    getCategoriesWithCounts(),
    getFeatureFlags(),
  ]);
  const latest = issues[0] ?? null;
  const [latestArticles, mostRead, mostDownloaded] = await Promise.all([
    latest ? getIssueArticles(latest.id) : Promise.resolve([]),
    flags.home_most_read ? getPopularArticles("views") : Promise.resolve([]),
    flags.home_most_read ? getPopularArticles("downloads") : Promise.resolve([]),
  ]);
  // Rankings mean nothing until someone has read something (item 27).
  const showMostRead = mostRead.some((a) => a.viewCount > 0);
  const showDownloads = mostDownloaded.some((a) => a.downloadCount > 0);
  // Subjects with nothing published yet stay on the Scope page only.
  const subjects = categories.filter((c) => c.articleCount > 0);
  // "Open access" is claimed only once the licence is confirmed in Settings (item 41).
  const badges = [`ISSN ${settings.issn}`, settings.licence ? "Open access" : null, "Peer reviewed"];
  // The wording is edited in Admin → Home page, or in place with "Edit this page".
  const home = settings.home;
  const T = (section: keyof typeof home, field: string, label: string, multiline = false) => (
    <EditableText
      section={section}
      field={field}
      text={(home[section] as Record<string, string | boolean>)[field] as string}
      label={label}
      multiline={multiline}
    />
  );

  return (
    <HomeEditProvider>
      <JsonLd
        data={periodicalLd({
          name: settings.journalName,
          shortName: settings.shortName,
          issn: settings.issn,
          publisher: settings.publisher,
          url: siteUrl,
          description: settings.subtitle,
          logoUrl: settings.logoUrl,
        })}
      />
      {/* Hero ------------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-white" aria-labelledby="hero-title">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] lg:block"
          style={{ clipPath: "polygon(30% 0, 100% 0, 100% 100%, 0 100%)" }}
        >
          <div className="accent-bands h-full w-full" />
        </div>
        <div className="relative mx-auto grid max-w-site items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-medium tracking-[0.16em] text-coral-ink uppercase">
              <EditableText
                section="hero"
                field="eyebrow"
                text={home.hero.eyebrow || settings.subtitle}
                label="Line above the title"
              />
            </p>
            <h1
              id="hero-title"
              className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-display"
            >
              <EditableText
                section="hero"
                field="title"
                text={home.hero.title || settings.journalName}
                label="Title"
              />
            </h1>
            <hr className="rule-gold mt-8 w-24" />
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              {T("hero", "intro", "Introduction", true)}
            </p>
            <p className="mt-4 text-sm font-medium text-ink-muted">
              <EditableText
                section="hero"
                field="badges"
                text={home.hero.badges || badges.filter(Boolean).join(" · ")}
                label="Line under the introduction"
              />
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={latest?.path ?? "/issues"}
                className="rounded-md bg-navy px-6 py-3 font-medium text-white no-underline shadow-sm transition-colors hover:bg-royal"
              >
                {T("hero", "readButton", "First button")}
              </Link>
              <Link
                href="/submit"
                className="rounded-md border border-navy bg-white px-6 py-3 font-medium text-navy no-underline transition-colors hover:bg-navy hover:text-white"
              >
                {T("hero", "submitButton", "Second button")}
              </Link>
            </div>
          </div>

          {latest ? (
            <div className="flex justify-center lg:justify-end lg:pr-6">
              <Link href={latest.path} className="group block w-56 no-underline sm:w-64 lg:w-[19rem]">
                <div className="rounded-[6px] bg-white p-2 shadow-[0_24px_48px_-20px_rgba(17,17,17,0.55)] transition-transform duration-300 group-hover:-translate-y-1">
                  <IssueCover issue={latest} priority sizes="(min-width: 1024px) 304px, 256px" />
                </div>
                <span className="mx-auto mt-4 block w-max max-w-full rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-ink shadow-sm">
                  {T("hero", "coverCaption", "Label under the cover")} · {latest.label}
                </span>
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* Latest issue contents ------------------------------------------ */}
      {latest && home.latest.show ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="latest-title">
          <SectionHeading
            id="latest-title"
            eyebrow={T("latest", "eyebrow", "Latest issue small heading")}
            title={latest.label}
            action={{ href: latest.path, label: T("latest", "actionLabel", "Link to the issue") }}
          />
          {latestArticles.length > 0 ? (
            <div className="mt-6 divide-y divide-line rounded-lg border border-line bg-white px-5 sm:px-8">
              {latestArticles.map((article) => (
                <ArticleRow key={article.id} article={article} showAbstract={false} />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-ink-muted">
              {T("latest", "empty", "Message while the issue has no articles", true)}
            </p>
          )}
        </section>
      ) : null}

      {/* Categories ------------------------------------------------------ */}
      {home.subjects.show ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="categories-title">
          <SectionHeading
            id="categories-title"
            eyebrow={T("subjects", "eyebrow", "Subjects small heading")}
            title={T("subjects", "title", "Subjects heading")}
            action={{ href: "/categories", label: T("subjects", "actionLabel", "Link to all subjects") }}
          />
          {/* Separate cards, so a short last row leaves no grey gap. */}
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {subjects.map((category) => (
              <li key={category.id} className="overflow-hidden rounded-lg border border-line bg-white">
                <Link
                  href={`/categories/${category.slug}`}
                  className="group flex h-full flex-col justify-between gap-3 p-4 no-underline transition-colors hover:bg-paper sm:p-5"
                >
                  <span className="font-semibold text-ink group-hover:text-navy">{category.name}</span>
                  <span className="text-sm text-ink-muted">{plural(category.articleCount, "article")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Most read / downloaded ------------------------------------------ */}
      {showMostRead ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="popular-title">
          <h2 id="popular-title" className="sr-only">
            Popular articles
          </h2>
          <div className={`grid gap-12 ${showDownloads ? "lg:grid-cols-2" : ""}`}>
            <PopularList
              eyebrow={T("popular", "eyebrow", "Most read small heading")}
              title={T("popular", "mostRead", "Most read heading")}
              articles={mostRead}
              metric="views"
            />
            {showDownloads ? (
              <PopularList
                eyebrow={T("popular", "eyebrow", "Most downloaded small heading")}
                title={T("popular", "mostDownloaded", "Most downloaded heading")}
                articles={mostDownloaded}
                metric="downloads"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* About + recent covers ------------------------------------------- */}
      {home.about.show || (home.recent.show && issues.length > 0) ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="about-title">
          <div
            className={`grid gap-12 ${home.about.show && home.recent.show && issues.length > 0 ? "lg:grid-cols-[1fr_1.4fr]" : ""}`}
          >
            {home.about.show ? (
              <div>
                <SectionHeading
                  id="about-title"
                  eyebrow={T("about", "eyebrow", "About small heading")}
                  title={T("about", "title", "About heading")}
                />
                <EditableRichText
                  section="about"
                  field="body"
                  html={sanitizeRichText(home.about.body)}
                  label="About text"
                  className="prose-reading mt-6 text-ink-muted"
                />
                <Link href="/about" className="mt-5 inline-block font-semibold text-navy hover:text-royal">
                  {T("about", "linkLabel", "Link to the About page")} <span aria-hidden>→</span>
                </Link>
              </div>
            ) : null}
            {home.recent.show && issues.length > 0 ? (
              <div>
                <div className="flex items-end justify-between">
                  <h3 id={home.about.show ? undefined : "about-title"} className="text-lg font-semibold">
                    {T("recent", "title", "Recent issues heading")}
                  </h3>
                  <Link href="/issues" className="text-sm font-semibold text-navy hover:text-royal">
                    {T("recent", "linkLabel", "Link to the archive")} <span aria-hidden>→</span>
                  </Link>
                </div>
                <ul className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                  {issues.slice(0, 4).map((issue) => (
                    <li key={issue.id}>
                      <Link href={issue.path} className="group block no-underline">
                        <IssueCover
                          issue={issue}
                          sizes="(min-width: 640px) 180px, 45vw"
                          className="transition-transform duration-300 group-hover:-translate-y-1"
                        />
                        <span className="mt-3 block text-sm font-medium text-ink group-hover:text-navy">
                          {issue.label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Call to action -------------------------------------------------- */}
      {home.cta.show ? (
        <section className="mx-auto max-w-site px-4 pt-24 sm:px-6 lg:px-8" aria-labelledby="cta-title">
          <div className="relative overflow-hidden rounded-xl bg-navy px-6 py-12 text-white sm:px-12">
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 hidden w-1/3 opacity-90 md:block"
              style={{ clipPath: "polygon(40% 0, 100% 0, 100% 100%, 0 100%)" }}
            >
              <div className="accent-bands h-full w-full" />
            </div>
            <div className="relative max-w-xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-gold-light uppercase">
                {T("cta", "eyebrow", "Authors box small heading")}
              </p>
              <h2 id="cta-title" className="mt-2 text-3xl text-white">
                {T("cta", "title", "Authors box heading")}
              </h2>
              <p className="mt-4 text-white/85">{T("cta", "body", "Authors box text", true)}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/submit"
                  className="rounded-md bg-white px-5 py-3 font-medium text-navy no-underline hover:bg-gold-light"
                >
                  {T("cta", "submitButton", "Authors box first button")}
                </Link>
                <Link
                  href="/submission-guidelines"
                  className="rounded-md border border-white/60 px-5 py-3 font-medium text-white no-underline hover:border-white hover:bg-white/10"
                >
                  {T("cta", "guidelinesButton", "Authors box second button")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </HomeEditProvider>
  );
}

function PopularList({
  eyebrow,
  title,
  articles,
  metric,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  articles: ArticleSummary[];
  metric: "views" | "downloads";
}) {
  return (
    <div>
      <SectionHeading eyebrow={eyebrow} title={title} />
      <ol className="mt-6 space-y-5">
        {articles.map((article, i) => {
          const count = metric === "views" ? article.viewCount : article.downloadCount;
          return (
            <li key={article.id} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <span aria-hidden className="text-3xl leading-none font-bold text-gold">
                {i + 1}
              </span>
              <div>
                <Link
                  href={`/articles/${article.slug}`}
                  className="font-semibold text-ink no-underline hover:text-navy hover:underline"
                >
                  {article.title}
                </Link>
                <p className="mt-1 text-sm text-ink-muted">
                  {authorLine(article.authors)}
                  {count > 0 ? <> · {plural(count, metric === "views" ? "view" : "download")}</> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

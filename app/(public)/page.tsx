import type { Metadata } from "next";
import Link from "next/link";
import { ArticleRow } from "@/components/catalog/article-row";
import { authorLine } from "@/components/catalog/author-names";
import { IssueCover } from "@/components/catalog/issue-cover";
import { SectionHeading } from "@/components/catalog/section-heading";
import {
  getCategoriesWithCounts,
  getIssueArticles,
  getPopularArticles,
  getPublishedIssues,
  type ArticleSummary,
} from "@/lib/data/catalog";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { getSiteSettings } from "@/lib/data/site-settings";

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
  const showDownloads = mostDownloaded.some((a) => a.downloadCount > 0);

  return (
    <>
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
              {settings.subtitle}
            </p>
            <h1
              id="hero-title"
              className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-display"
            >
              {settings.journalName}
            </h1>
            <hr className="rule-gold mt-8 w-24" />
            <p className="mt-6 max-w-xl font-serif text-reading text-ink-muted">
              A forum for scholars publishing on the African literary and linguistic experience and on issues
              in global English language and literary studies, published since 2001 by the{" "}
              {settings.publisher}.
            </p>
            <p className="mt-4 text-sm font-medium text-ink-muted">
              ISSN {settings.issn} · Open access · Peer reviewed
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={latest?.path ?? "/issues"}
                className="rounded-md bg-navy px-6 py-3 font-medium text-white no-underline shadow-sm transition-colors hover:bg-royal"
              >
                Read the latest issue
              </Link>
              <Link
                href="/submit"
                className="rounded-md border border-navy bg-white px-6 py-3 font-medium text-navy no-underline transition-colors hover:bg-navy hover:text-white"
              >
                Submit a manuscript
              </Link>
            </div>
          </div>

          {latest ? (
            <div className="flex justify-center lg:justify-end lg:pr-6">
              <Link
                href={latest.path}
                className="group block w-56 no-underline sm:w-64 lg:w-[19rem]"
                aria-label={`Latest issue: ${latest.label}`}
              >
                <div className="rounded-[6px] bg-white p-2 shadow-[0_24px_48px_-20px_rgba(17,17,17,0.55)] transition-transform duration-300 group-hover:-translate-y-1">
                  <IssueCover issue={latest} priority sizes="(min-width: 1024px) 304px, 256px" />
                </div>
                <span className="mx-auto mt-4 block w-max max-w-full rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-ink shadow-sm">
                  Latest issue · {latest.label}
                </span>
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* Latest issue contents ------------------------------------------ */}
      {latest ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="latest-title">
          <SectionHeading
            id="latest-title"
            eyebrow="Latest issue"
            title={latest.label}
            action={{ href: latest.path, label: "View the full issue" }}
          />
          {latestArticles.length > 0 ? (
            <div className="mt-6 divide-y divide-line rounded-lg border border-line bg-white px-5 sm:px-8">
              {latestArticles.map((article) => (
                <ArticleRow key={article.id} article={article} showAbstract={false} />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-ink-muted">Articles for this issue will appear here shortly.</p>
          )}
        </section>
      ) : null}

      {/* Categories ------------------------------------------------------ */}
      <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="categories-title">
        <SectionHeading id="categories-title" eyebrow="Subject areas" title="Browse by category" />
        <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 lg:grid-cols-5">
          {categories.map((category) => (
            <li key={category.id} className="bg-white">
              <Link
                href={`/categories/${category.slug}`}
                className="group flex h-full flex-col justify-between gap-3 p-4 no-underline transition-colors hover:bg-paper sm:p-5"
              >
                <span className="font-semibold text-ink group-hover:text-navy">{category.name}</span>
                <span className="text-sm text-ink-muted">
                  {category.articleCount} {category.articleCount === 1 ? "article" : "articles"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Most read / downloaded ------------------------------------------ */}
      {mostRead.length > 0 ? (
        <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="popular-title">
          <h2 id="popular-title" className="sr-only">
            Popular articles
          </h2>
          <div className={`grid gap-12 ${showDownloads ? "lg:grid-cols-2" : ""}`}>
            <PopularList title="Most read" articles={mostRead} metric="views" />
            {showDownloads ? (
              <PopularList title="Most downloaded" articles={mostDownloaded} metric="downloads" />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* About + recent covers ------------------------------------------- */}
      <section className="mx-auto max-w-site px-4 pt-20 sm:px-6 lg:px-8" aria-labelledby="about-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionHeading
              id="about-title"
              eyebrow="About AWLEL"
              title="A journal of language and literature since 2001"
            />
            <p className="prose-reading mt-6 text-ink-muted">
              Founded in 2001 as <em>Africa and World Literature</em> (AWL), the journal widened its scope to
              become <em>African, World Literature and English Language</em>. It publishes peer-reviewed
              scholarship on African writing, orature and languages alongside work on world literatures and
              English as a global language. Every article is free to read and download.
            </p>
            <Link href="/about" className="mt-5 inline-block font-semibold text-navy hover:text-royal">
              More about the journal <span aria-hidden>→</span>
            </Link>
          </div>
          {issues.length > 0 ? (
            <div>
              <div className="flex items-end justify-between">
                <h3 className="text-lg font-semibold">Recent issues</h3>
                <Link href="/issues" className="text-sm font-semibold text-navy hover:text-royal">
                  Full archive <span aria-hidden>→</span>
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

      {/* Call to action -------------------------------------------------- */}
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
            <p className="text-xs font-semibold tracking-[0.18em] text-gold-light uppercase">For authors</p>
            <h2 id="cta-title" className="mt-2 text-3xl text-white">
              Publish with AWLEL
            </h2>
            <p className="mt-4 text-white/85">
              We welcome original research on African and world literatures, English language studies and
              linguistics. Read the guidelines, prepare your manuscript in Word, and submit it online.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/submit"
                className="rounded-md bg-white px-5 py-3 font-medium text-navy no-underline hover:bg-gold-light"
              >
                Submit a manuscript
              </Link>
              <Link
                href="/submission-guidelines"
                className="rounded-md border border-white/60 px-5 py-3 font-medium text-white no-underline hover:border-white hover:bg-white/10"
              >
                Submission guidelines
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PopularList({
  title,
  articles,
  metric,
}: {
  title: string;
  articles: ArticleSummary[];
  metric: "views" | "downloads";
}) {
  return (
    <div>
      <SectionHeading eyebrow="Readers' choice" title={title} />
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
                  {count > 0 ? (
                    <>
                      {" "}
                      · {count.toLocaleString("en")} {metric}
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { authorLine } from "@/components/catalog/author-names";
import { CategoryTag } from "@/components/catalog/category-tag";
import { Highlight } from "@/components/catalog/highlight";
import { pageRange } from "@/components/catalog/page-range";
import { Pagination, PastTheEnd } from "@/components/catalog/pagination";
import {
  getArticlesByIds,
  getCategoriesWithCounts,
  getPublishedIssues,
  type IssueSummary,
} from "@/lib/data/catalog";
import { SEARCH_PAGE_SIZE, searchArticles, searchParamsSchema, type SearchParams } from "@/lib/data/search";
import { plural } from "@/lib/plural";
import { isPrerenderAbort } from "@/lib/search-text";
import { articleDownloadPath } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Search",
  description: "Search AWLEL articles by title, abstract, keyword or author.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

type Props = PageProps<"/search">;

/**
 * The URL's search, made consistent: an issue already fixes the year, so a
 * year chosen alongside it is dropped rather than contradicting it (item 42).
 */
function readParams(raw: unknown): SearchParams {
  const params = searchParamsSchema.parse(raw);
  return params.issue ? { ...params, year: undefined } : params;
}

function hrefWith(params: SearchParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, page })) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) qs.set(key, String(value));
  }
  return `/search?${qs.toString()}`;
}

async function SearchForm({ searchParams }: { searchParams: Props["searchParams"] }) {
  const [raw, issues, categories] = await Promise.all([
    searchParams,
    getPublishedIssues(),
    getCategoriesWithCounts(),
  ]);
  const params = readParams(raw);
  const years = [...new Set(issues.map((i) => i.year))].sort((a, b) => b - a);
  const byYear = new Map<number, IssueSummary[]>();
  for (const issue of issues) byYear.set(issue.year, [...(byYear.get(issue.year) ?? []), issue]);
  const field = "mt-1.5 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-ink";
  const filtered = Boolean(params.year || params.issue || params.category || params.author);

  return (
    <form role="search" action="/search" className="rounded-lg border border-line bg-white p-5 sm:p-6">
      <label htmlFor="q" className="text-sm font-semibold">
        Search the journal
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={200}
          placeholder="Title, abstract, keyword or author"
          className="min-w-0 flex-1 rounded-md border border-line px-4 py-3 text-lg"
        />
        <button type="submit" className="rounded-md bg-navy px-6 py-3 font-medium text-white hover:bg-royal">
          Search
        </button>
      </div>
      <fieldset className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Filters</legend>
        <label className="text-sm text-ink-muted">
          Year
          <select name="year" defaultValue={params.year ?? ""} className={field}>
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-muted">
          Volume / issue
          <select
            name="issue"
            defaultValue={params.issue ?? ""}
            className={field}
            aria-describedby="issue-hint"
          >
            <option value="">Any issue</option>
            {years.map((y) => (
              <optgroup key={y} label={String(y)}>
                {(byYear.get(y) ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span id="issue-hint" className="mt-1 block text-xs">
            An issue already sets the year.
          </span>
        </label>
        <label className="text-sm text-ink-muted">
          Category
          <select name="category" defaultValue={params.category ?? ""} className={field}>
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-muted">
          Author
          <input
            name="author"
            defaultValue={params.author}
            maxLength={120}
            placeholder="Any author"
            className={field}
          />
        </label>
      </fieldset>
      {filtered ? (
        <p className="mt-4 text-sm">
          <Link
            href={params.q ? `/search?q=${encodeURIComponent(params.q)}` : "/search"}
            className="font-semibold"
          >
            Clear filters
          </Link>
        </p>
      ) : null}
    </form>
  );
}

async function SearchResults({ searchParams }: { searchParams: Props["searchParams"] }) {
  const params = readParams(await searchParams);
  const hasFilters = Boolean(params.q || params.year || params.issue || params.category || params.author);
  if (!hasFilters) {
    return <p className="mt-10 text-ink-muted">Enter a search term or choose a filter to find articles.</p>;
  }
  // Results are never cached, so they belong to a real visit only. Without
  // this, a background prefetch of a /search link started the query and
  // Next.js then cut it off, logging a spurious "search failed" (item 39).
  await connection();

  let result: Awaited<ReturnType<typeof searchArticles>>;
  try {
    result = await searchArticles(params);
  } catch (error) {
    if (isPrerenderAbort(error)) throw error;
    return (
      <p role="alert" className="mt-10 rounded-lg border border-coral/40 bg-[#FDECEF] p-5 text-[#A3283C]">
        Search is temporarily unavailable. Please try again in a moment.
      </p>
    );
  }

  const [articles, issues] = await Promise.all([
    getArticlesByIds(result.hits.map((h) => h.id)),
    getPublishedIssues(),
  ]);
  const byId = new Map(articles.map((a) => [a.id, a]));
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const page = params.page ?? 1;
  const pages = Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE));

  return (
    <section aria-labelledby="results-title" className="mt-10">
      <h2 id="results-title" className="border-b-2 border-navy pb-3 text-lg font-semibold" aria-live="polite">
        {result.total === 0 ? "No articles found" : `${plural(result.total, "article")} found`}
      </h2>
      {result.total === 0 ? (
        <p className="mt-6 text-ink-muted">
          Try fewer or different words, check the spelling, or remove a filter. You can also{" "}
          <Link href="/issues">browse the archive</Link>.
        </p>
      ) : result.hits.length === 0 ? (
        <PastTheEnd pages={pages} firstHref={hrefWith(params, 1)} />
      ) : (
        <ol className="divide-y divide-line">
          {result.hits.map((hit) => {
            const article = byId.get(hit.id);
            const issue = article ? issueById.get(article.issueId) : undefined;
            const pagesText = article ? pageRange(article.firstPage, article.lastPage) : null;
            return (
              <li key={hit.id} className="py-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                  {article?.category ? <CategoryTag category={article.category} /> : null}
                  {issue ? (
                    <Link href={issue.path} className="text-ink-muted hover:text-navy">
                      {issue.label}
                    </Link>
                  ) : null}
                  {pagesText ? <span>{pagesText}</span> : null}
                  {article?.hasPdf ? (
                    <a
                      href={articleDownloadPath(article.id, "pdf")}
                      className="inline-flex items-center gap-1 font-semibold text-navy hover:text-royal"
                    >
                      <FileText aria-hidden className="size-3.5" />
                      PDF<span className="sr-only"> of {article.title}</span>
                    </a>
                  ) : null}
                </div>
                <h3 className="mt-2 text-lg font-semibold sm:text-xl">
                  <Link
                    href={`/articles/${hit.slug}`}
                    className="text-ink no-underline hover:text-navy hover:underline"
                  >
                    <Highlight text={hit.titleHighlight} />
                  </Link>
                </h3>
                {article ? (
                  <p className="mt-1 text-[0.95rem] text-ink-muted">{authorLine(article.authors)}</p>
                ) : null}
                <p className="mt-2 max-w-[75ch] font-serif text-[1.02rem] leading-relaxed text-ink/90">
                  <Highlight text={hit.abstractHighlight} />
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {result.hits.length > 0 ? (
        <Pagination
          page={page}
          pages={pages}
          label="Search results pages"
          hrefFor={(p) => hrefWith(params, p)}
        />
      ) : null}
    </section>
  );
}

export default function SearchPage({ searchParams }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Search</p>
      <h1 className="mt-2 text-4xl">Find an article</h1>
      <hr className="rule-gold mt-6 mb-8 w-20" />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <SearchForm searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <div
            className="mt-10 h-64 min-h-[70svh] animate-pulse rounded-lg bg-line/60"
            aria-busy="true"
            aria-label="Searching"
          />
        }
      >
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

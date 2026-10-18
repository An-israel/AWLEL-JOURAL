import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/site";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleRow } from "@/components/catalog/article-row";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { categoryTint } from "@/components/catalog/category-tag";
import { Pagination, PastTheEnd } from "@/components/catalog/pagination";
import {
  CATEGORY_PAGE_SIZE,
  getCategoriesWithCounts,
  getCategory,
  getCategoryArticles,
  getPublishedIssues,
  type CategoryInfo,
  type CategorySort,
} from "@/lib/data/catalog";
import { plural } from "@/lib/plural";

type Props = PageProps<"/categories/[slug]">;

export async function generateStaticParams() {
  const categories = await getCategoriesWithCounts();
  return categories.length > 0 ? categories.map((c) => ({ slug: c.slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: "Category not found" };
  const description = category.description ?? `Articles in ${category.name} published in AWLEL.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: {
      title: `${category.name} — AWLEL`,
      description,
      url: `/categories/${slug}`,
      images: DEFAULT_OG_IMAGE,
    },
  };
}

function pageHref(slug: string, page: number, sort: CategorySort): string {
  const qs = new URLSearchParams();
  if (sort !== "newest") qs.set("sort", sort);
  if (page > 1) qs.set("page", String(page));
  const query = qs.toString();
  return `/categories/${slug}${query ? `?${query}` : ""}`;
}

function readPage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

/** The paged article list; reads ?page= and ?sort=, so it streams in (item 30). */
async function CategoryArticles({
  category,
  searchParams,
}: {
  category: CategoryInfo;
  searchParams: Props["searchParams"];
}) {
  const raw = await searchParams;
  const sort: CategorySort = raw.sort === "read" ? "read" : "newest";
  const page = readPage(raw.page);
  const [data, issues] = await Promise.all([
    getCategoryArticles(category.slug, page, sort),
    getPublishedIssues(),
  ]);
  if (!data) notFound();
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const pages = Math.max(1, Math.ceil(data.total / CATEGORY_PAGE_SIZE));

  if (data.total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink-muted">
        No articles have been published in this category yet.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-navy pb-3">
        <p className="text-sm text-ink-muted">{plural(data.total, "article")}</p>
        <nav aria-label="Sort articles" className="inline-flex rounded-md border border-line bg-white p-0.5">
          {(
            [
              ["newest", "Newest"],
              ["read", "Most read"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={pageHref(category.slug, 1, value)}
              aria-current={sort === value ? "true" : undefined}
              scroll={false}
              className={`rounded px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
                sort === value ? "bg-navy text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {data.articles.length > 0 ? (
        <div className="divide-y divide-line">
          {data.articles.map((article) => {
            const issue = issueById.get(article.issueId);
            return (
              <ArticleRow
                key={article.id}
                article={article}
                issueLabel={issue?.label}
                issuePath={issue?.path}
              />
            );
          })}
        </div>
      ) : (
        <PastTheEnd pages={pages} firstHref={pageHref(category.slug, 1, sort)} />
      )}
      <Pagination
        page={page}
        pages={pages}
        label="Category pages"
        hrefFor={(p) => pageHref(category.slug, p, sort)}
      />
    </>
  );
}

async function OtherCategories({ current }: { current: string }) {
  const categories = await getCategoriesWithCounts();
  return (
    <nav aria-label="Other categories" className="lg:pt-24">
      <h2 className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">
        <Link href="/categories" className="text-ink-muted no-underline hover:text-navy">
          All categories
        </Link>
      </h2>
      <ul className="mt-4 space-y-1">
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={`/categories/${c.slug}`}
              aria-current={c.slug === current ? "page" : undefined}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm no-underline ${
                c.slug === current
                  ? `${categoryTint(c.slug)} font-semibold`
                  : "text-ink hover:bg-white hover:text-navy"
              }`}
            >
              <span>{c.name}</span>
              <span className="text-xs opacity-80">{c.articleCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default async function CategoryPage({ params, searchParams }: Props) {
  // Looked up before anything streams, so an unknown subject is a real 404.
  // Archived subjects still have a page: their articles link to it (item 75).
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-site px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { href: "/", label: "Home" },
          { href: "/categories", label: "Categories" },
          { label: category.name },
        ]}
      />
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <header className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Subject area</p>
            <h1 className="mt-2 text-4xl sm:text-5xl">{category.name}</h1>
            <hr className="rule-gold mt-6 w-20" />
            {category.description ? (
              <p className="prose-reading mt-6 text-ink-muted">{category.description}</p>
            ) : null}
          </header>
          <div className="mt-12">
            <Suspense
              fallback={<div className="h-64 animate-pulse rounded-lg bg-line/60" aria-busy="true" />}
            >
              <CategoryArticles category={category} searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
        <OtherCategories current={slug} />
      </div>
    </div>
  );
}

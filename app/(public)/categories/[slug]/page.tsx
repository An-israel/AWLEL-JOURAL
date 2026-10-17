import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/site";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleRow } from "@/components/catalog/article-row";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { categoryTint } from "@/components/catalog/category-tag";
import { SortableList } from "@/components/catalog/sortable-list";
import { getCategoriesWithCounts, getCategoryArticles, getPublishedIssues } from "@/lib/data/catalog";

type Props = PageProps<"/categories/[slug]">;

export async function generateStaticParams() {
  const categories = await getCategoriesWithCounts();
  return categories.length > 0 ? categories.map((c) => ({ slug: c.slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryArticles(slug);
  if (!data) return { title: "Category not found" };
  const description = data.category.description ?? `Articles in ${data.category.name} published in AWLEL.`;
  return {
    title: data.category.name,
    description,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: {
      title: `${data.category.name} — AWLEL`,
      description,
      url: `/categories/${slug}`,
      images: DEFAULT_OG_IMAGE,
    },
  };
}

async function CategoryContent({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const [data, issues, categories] = await Promise.all([
    getCategoryArticles(slug),
    getPublishedIssues(),
    getCategoriesWithCounts(),
  ]);
  if (!data) notFound();
  const issueById = new Map(issues.map((i) => [i.id, i]));

  return (
    <div className="mx-auto max-w-site px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[{ href: "/", label: "Home" }, { label: "Categories" }, { label: data.category.name }]}
      />
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <header className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Subject area</p>
            <h1 className="mt-2 text-4xl sm:text-5xl">{data.category.name}</h1>
            <hr className="rule-gold mt-6 w-20" />
            {data.category.description ? (
              <p className="prose-reading mt-6 text-ink-muted">{data.category.description}</p>
            ) : null}
          </header>
          <div className="mt-12">
            {data.articles.length > 0 ? (
              <SortableList
                items={data.articles.map((article) => {
                  const issue = issueById.get(article.issueId);
                  return {
                    key: article.id,
                    publishedAt: article.publishedAt,
                    views: article.viewCount,
                    node: <ArticleRow article={article} issueLabel={issue?.label} issuePath={issue?.path} />,
                  };
                })}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink-muted">
                No articles have been published in this category yet.
              </p>
            )}
          </div>
        </div>
        <nav aria-label="Other categories" className="lg:pt-24">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">All categories</h2>
          <ul className="mt-4 space-y-1">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}`}
                  aria-current={c.slug === slug ? "page" : undefined}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm no-underline ${
                    c.slug === slug
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
      </div>
    </div>
  );
}

export default function CategoryPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto max-w-site animate-pulse space-y-4 px-4 py-16 sm:px-6 lg:px-8"
          aria-busy="true"
        >
          <div className="h-12 w-1/2 rounded bg-line" />
          <div className="h-32 rounded bg-line" />
        </div>
      }
    >
      <CategoryContent params={params} />
    </Suspense>
  );
}

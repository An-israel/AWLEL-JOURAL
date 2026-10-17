import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ArticleStats } from "@/components/catalog/article-stats";
import { authorLine } from "@/components/catalog/author-names";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { CategoryTag } from "@/components/catalog/category-tag";
import { CitePanel } from "@/components/catalog/cite-panel";
import { DownloadLinks } from "@/components/catalog/download-links";
import { OrcidLink } from "@/components/catalog/orcid-link";
import { pageRange } from "@/components/catalog/page-range";
import { PdfPreview } from "@/components/catalog/pdf-preview";
import { RichText } from "@/components/catalog/rich-text";
import { ShareLinks } from "@/components/catalog/share-links";
import { JsonLd } from "@/components/seo/json-ld";
import { MetaTags } from "@/components/seo/meta-tags";
import {
  formatApa,
  formatBibtex,
  formatMla,
  formatRis,
  parseName,
  type CitationInput,
} from "@/lib/citations";
import {
  getArticleBySlug,
  getCategoryArticles,
  getIssueArticles,
  getPublishedArticleSlugs,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { issueFileStem } from "@/lib/issue-label";
import { richTextToPlain } from "@/lib/sanitize";
import { scholarlyArticleLd } from "@/lib/seo/json-ld";
import { dublinCoreTags, scholarTags, type ScholarlyArticleMeta } from "@/lib/seo/scholarly-meta";
import { articleDownloadPath } from "@/lib/storage";

type Props = PageProps<"/articles/[slug]">;

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getArticleBySlug(slug);
  if (!result || !("article" in result)) return { title: "Article not found" };
  const { article } = result;
  const description = richTextToPlain(article.abstract).slice(0, 300) || article.title;
  const path = `/articles/${article.slug}`;
  return {
    title: article.title,
    description,
    authors: article.authors.map((a) => ({ name: a.fullName })),
    keywords: article.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: path,
      publishedTime: article.publishedAt ?? undefined,
      authors: article.authors.map((a) => a.fullName),
      tags: article.keywords,
    },
    twitter: { card: "summary_large_image", title: article.title, description },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

function citationInput(
  article: ArticleDetail,
  journal: string,
  issn: string,
  publisher: string,
): CitationInput {
  return {
    authors: article.authors.map((a) => ({ fullName: a.fullName })),
    title: article.title,
    journal,
    year: article.issue.year,
    volume: article.issue.volumeNumber,
    issue: article.issue.issuesInVolume > 1 ? article.issue.issueNumber : null,
    firstPage: article.firstPage,
    lastPage: article.lastPage,
    doi: article.doi,
    url: `${siteUrl}/articles/${article.slug}`,
    issn,
    publisher,
    keywords: article.keywords,
    abstract: richTextToPlain(article.abstract),
  };
}

function RelatedList({
  title,
  articles,
  more,
}: {
  title: string;
  articles: ArticleSummary[];
  more?: { href: string; label: string };
}) {
  if (articles.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <hr className="rule-gold mt-3 w-12" />
      <ul className="mt-4 divide-y divide-line">
        {articles.map((a) => (
          <li key={a.id} className="py-3.5">
            <Link
              href={`/articles/${a.slug}`}
              className="font-medium text-ink no-underline hover:text-navy hover:underline"
            >
              {a.title}
            </Link>
            <p className="mt-0.5 text-sm text-ink-muted">{authorLine(a.authors)}</p>
          </li>
        ))}
      </ul>
      {more ? (
        <Link href={more.href} className="mt-2 inline-block text-sm font-semibold text-navy hover:text-royal">
          {more.label} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </section>
  );
}

async function ArticleContent({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const result = await getArticleBySlug(slug);
  if (!result) notFound();
  if ("redirectTo" in result) permanentRedirect(`/articles/${result.redirectTo}`);
  const { article } = result;

  const [settings, issueArticles, categoryData] = await Promise.all([
    getSiteSettings(),
    getIssueArticles(article.issue.id),
    article.category ? getCategoryArticles(article.category.slug) : Promise.resolve(null),
  ]);

  const input = citationInput(article, settings.journalName, settings.issn, settings.publisher);
  const firstFamily = article.authors[0]
    ? parseName(article.authors[0].fullName).family.replace(/[^\w-]/g, "")
    : "Article";
  const risFileName = `AWLEL_${issueFileStem(article.issue)}_${firstFamily}_${article.issue.year}.ris`;
  const pages = pageRange(article.firstPage, article.lastPage);
  const fromIssue = issueArticles.filter((a) => a.id !== article.id).slice(0, 5);
  const inCategory = (categoryData?.articles ?? []).filter((a) => a.id !== article.id).slice(0, 5);
  const url = `${siteUrl}/articles/${article.slug}`;
  const pdfUrl = article.hasPdf ? `${siteUrl}${articleDownloadPath(article.id, "pdf")}` : null;
  const abstract = richTextToPlain(article.abstract);
  const scholarly: ScholarlyArticleMeta = {
    title: article.title,
    authors: article.authors,
    publishedAt: article.publishedAt,
    year: article.issue.year,
    journal: settings.journalName,
    journalAbbrev: settings.shortName,
    issn: settings.issn,
    publisher: settings.publisher,
    volume: article.issue.volumeNumber,
    issue: input.issue ?? null,
    firstPage: article.firstPage,
    lastPage: article.lastPage,
    doi: article.doi,
    keywords: article.keywords,
    abstract,
    url,
    pdfUrl,
    docxUrl: article.hasDocx ? `${siteUrl}${articleDownloadPath(article.id, "docx")}` : null,
  };
  const structured = scholarlyArticleLd(
    {
      name: settings.journalName,
      shortName: settings.shortName,
      issn: settings.issn,
      publisher: settings.publisher,
      url: siteUrl,
    },
    {
      volume: article.issue.volumeNumber,
      issue: input.issue ?? null,
      year: article.issue.year,
      label: article.issue.label,
      url: `${siteUrl}${article.issue.path}`,
      datePublished: article.issue.publishedAt,
    },
    {
      title: article.title,
      url,
      abstract,
      keywords: article.keywords,
      authors: article.authors,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      firstPage: article.firstPage,
      lastPage: article.lastPage,
      doi: article.doi,
      pdfUrl,
    },
  );
  const affiliations = [
    ...new Set(article.authors.map((a) => a.affiliation).filter((a): a is string => Boolean(a))),
  ];

  return (
    <article>
      <MetaTags tags={[...scholarTags(scholarly), ...dublinCoreTags(scholarly)]} />
      <link rel="schema.DC" href="http://purl.org/dc/elements/1.1/" />
      <JsonLd data={structured} />
      <header className="bg-white">
        <div className="mx-auto max-w-site px-4 pt-8 pb-12 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { href: "/issues", label: "Journal Archive" },
              { href: article.issue.path, label: article.issue.label },
              { label: "Article" },
            ]}
          />
          <div className="mt-8 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
              {article.category ? <CategoryTag category={article.category} size="md" /> : null}
              <span>Research article</span>
            </div>
            <h1 className="mt-4 text-3xl leading-tight sm:text-4xl lg:text-[2.75rem]">{article.title}</h1>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-lg">
              {article.authors.map((author) => {
                const n = author.affiliation ? affiliations.indexOf(author.affiliation) + 1 : 0;
                return (
                  <li key={author.fullName} className="inline-flex items-center gap-1.5 font-medium text-ink">
                    {author.fullName}
                    {n > 0 && affiliations.length > 1 ? (
                      <sup className="text-xs text-ink-muted">{n}</sup>
                    ) : null}
                    {author.orcid ? <OrcidLink orcid={author.orcid} name={author.fullName} /> : null}
                  </li>
                );
              })}
            </ul>
            {affiliations.length > 0 ? (
              <ol className="mt-3 space-y-0.5 text-sm text-ink-muted">
                {affiliations.map((aff, i) => (
                  <li key={aff}>
                    {affiliations.length > 1 ? <sup className="mr-1">{i + 1}</sup> : null}
                    {aff}
                  </li>
                ))}
              </ol>
            ) : null}

            <hr className="rule-gold mt-8 w-20" />
            <dl className="mt-6 grid gap-x-10 gap-y-3 text-sm sm:grid-cols-2 lg:flex lg:flex-wrap">
              <div>
                <dt className="text-ink-muted">Published in</dt>
                <dd className="font-medium">
                  <Link href={article.issue.path}>{article.issue.label}</Link>
                  {pages ? `, ${pages}` : ""}
                </dd>
              </div>
              {article.publishedAt ? (
                <div>
                  <dt className="text-ink-muted">Published</dt>
                  <dd className="font-medium">
                    <time dateTime={article.publishedAt}>
                      {dateFormat.format(new Date(article.publishedAt))}
                    </time>
                  </dd>
                </div>
              ) : null}
              {article.doi ? (
                <div>
                  <dt className="text-ink-muted">DOI</dt>
                  <dd className="font-medium">
                    <a href={`https://doi.org/${article.doi}`}>{article.doi}</a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-ink-muted">Citation style</dt>
                <dd className="font-medium">
                  {article.citationStyle === "apa7" ? "APA 7th edition" : "MLA 8th edition"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-site gap-12 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_22rem] lg:px-8">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="abstract-title">
            <h2 id="abstract-title" className="text-xl">
              Abstract
            </h2>
            <RichText html={article.abstract} className="prose-reading mt-4" />
            {article.keywords.length > 0 ? (
              <div className="mt-8">
                <h3 className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">Keywords</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {article.keywords.map((k) => (
                    <li key={k}>
                      <Link
                        href={`/search?q=${encodeURIComponent(`"${k}"`)}`}
                        className="inline-block rounded-full border border-line bg-white px-3 py-1 text-sm text-ink no-underline hover:border-navy hover:text-navy"
                      >
                        {k}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {article.hasPdf ? (
            <PdfPreview src={`${articleDownloadPath(article.id, "pdf")}&inline=1`} title={article.title} />
          ) : null}

          <div className="grid gap-12 md:grid-cols-2">
            <RelatedList
              title="More from this issue"
              articles={fromIssue}
              more={{ href: article.issue.path, label: "Full contents" }}
            />
            {article.category ? (
              <RelatedList
                title={`More in ${article.category.name}`}
                articles={inCategory}
                more={{
                  href: `/categories/${article.category.slug}`,
                  label: "All articles in this category",
                }}
              />
            ) : null}
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start" aria-label="Article tools">
          <section aria-labelledby="download-title" className="rounded-lg border border-line bg-white p-5">
            <h2 id="download-title" className="text-base font-semibold">
              Read and download
            </h2>
            <div className="mt-4">
              {article.hasPdf || article.hasDocx ? (
                <DownloadLinks
                  variant="large"
                  options={[
                    article.hasPdf && {
                      href: articleDownloadPath(article.id, "pdf"),
                      label: "Download PDF",
                      format: "PDF",
                      sizeBytes: article.pdf?.sizeBytes,
                    },
                    article.hasDocx && {
                      href: articleDownloadPath(article.id, "docx"),
                      label: "Download Word",
                      format: "Word",
                      sizeBytes: article.docx?.sizeBytes,
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-ink-muted">
                  The full text of this article will be available to download soon.
                </p>
              )}
            </div>
            <ArticleStats
              articleId={article.id}
              views={article.viewCount}
              downloads={article.downloadCount}
            />
          </section>
          <CitePanel
            apa={formatApa(input)}
            mla={formatMla(input)}
            bibtex={formatBibtex(input)}
            ris={formatRis(input)}
            risFileName={risFileName}
          />
          <ShareLinks url={url} title={article.title} />
        </aside>
      </div>
    </article>
  );
}

function ArticleSkeleton() {
  return (
    <div
      className="mx-auto max-w-site animate-pulse space-y-5 px-4 py-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading article"
    >
      <div className="h-4 w-48 rounded bg-line" />
      <div className="h-12 w-3/4 rounded bg-line" />
      <div className="h-5 w-1/2 rounded bg-line" />
      <div className="h-40 max-w-3xl rounded bg-line" />
    </div>
  );
}

export default function ArticlePage({ params }: Props) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <ArticleContent params={params} />
    </Suspense>
  );
}

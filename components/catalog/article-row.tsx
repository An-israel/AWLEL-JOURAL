import Link from "next/link";
import type { ArticleSummary } from "@/lib/data/catalog";
import { articleDownloadPath } from "@/lib/storage";
import { AuthorNames } from "./author-names";
import { CategoryTag } from "./category-tag";
import { DownloadLinks } from "./download-links";
import { pageRange } from "./page-range";
import { RichText } from "./rich-text";

/** One entry in a table of contents or article list. */
export function ArticleRow({
  article,
  issueLabel,
  issuePath,
  showAbstract = true,
  headingLevel = 3,
}: {
  article: ArticleSummary;
  issueLabel?: string;
  issuePath?: string;
  showAbstract?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const pages = pageRange(article.firstPage, article.lastPage);
  const titleId = `article-${article.id}`;

  return (
    <article className="group grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:gap-8" aria-labelledby={titleId}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
          {article.category ? <CategoryTag category={article.category} /> : null}
          {pages ? <span>{pages}</span> : null}
          {issueLabel && issuePath ? (
            <Link href={issuePath} className="text-ink-muted hover:text-navy">
              {issueLabel}
            </Link>
          ) : null}
        </div>
        <Heading id={titleId} className="mt-2.5 text-lg leading-snug font-semibold sm:text-xl">
          <Link
            href={`/articles/${article.slug}`}
            className="text-ink no-underline decoration-gold decoration-2 underline-offset-4 hover:text-navy hover:underline"
          >
            {article.title}
          </Link>
        </Heading>
        <AuthorNames authors={article.authors} className="mt-1.5 text-[0.95rem] text-ink-muted" />
        {showAbstract && article.abstract ? (
          <details className="group/abs mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-navy select-none hover:text-royal [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="inline-block transition-transform group-open/abs:rotate-90">
                ▸
              </span>
              <span className="group-open/abs:hidden">Show abstract</span>
              <span className="hidden group-open/abs:inline">Hide abstract</span>
            </summary>
            <RichText
              html={article.abstract}
              className="prose-reading mt-3 border-l-2 border-gold-light pl-4 text-[1.0625rem]"
            />
          </details>
        ) : null}
      </div>
      <DownloadLinks
        describedBy={titleId}
        options={[
          article.hasPdf && {
            href: articleDownloadPath(article.id, "pdf"),
            label: "Download PDF",
            format: "PDF",
          },
          article.hasDocx && {
            href: articleDownloadPath(article.id, "docx"),
            label: "Download Word",
            format: "Word",
          },
        ]}
      />
    </article>
  );
}

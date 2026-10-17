import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryTag } from "@/components/catalog/category-tag";
import { OrcidLink } from "@/components/catalog/orcid-link";
import { pageRange } from "@/components/catalog/page-range";
import { RichText } from "@/components/catalog/rich-text";
import { PreviewBanner } from "@/components/admin/preview-banner";
import { previewArticles, previewIssueSummary } from "@/lib/admin/preview-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Article preview" };

type Props = PageProps<"/admin/articles/[id]/preview">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/articles/${id}/preview`);
  const [article] = await previewArticles({ articleId: id });
  if (!article) notFound();
  const supabase = await createSupabaseServerClient();
  const [issue, { data }] = await Promise.all([
    previewIssueSummary(article.issueId),
    supabase.from("articles").select("status, keywords, doi").eq("id", id).single(),
  ]);
  const pages = pageRange(article.firstPage, article.lastPage);
  return (
    <>
      <PreviewBanner backHref={`/admin/articles/${id}`} status={data?.status ?? "draft"} />
      <article className="mt-8 max-w-4xl">
        {article.category ? <CategoryTag category={article.category} size="md" /> : null}
        <h2 className="mt-4 text-4xl leading-tight">{article.title}</h2>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-lg">
          {article.authors.map((a) => (
            <li key={a.fullName} className="inline-flex items-center gap-1.5 font-medium">
              {a.fullName}
              {a.orcid ? <OrcidLink orcid={a.orcid} name={a.fullName} /> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted">{[...new Set(article.authors.map((a) => a.affiliation).filter(Boolean))].join(" · ")}</p>
        <p className="mt-4 text-sm">
          {issue?.label}
          {pages ? `, ${pages}` : ""}
          {data?.doi ? ` · DOI ${data.doi}` : ""}
        </p>
        <hr className="rule-gold mt-6 w-20" />
        <h3 className="mt-8 text-xl">Abstract</h3>
        <RichText html={article.abstract} className="prose-reading mt-3" />
        {data?.keywords.length ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {data.keywords.map((k) => (
              <li key={k} className="rounded-full border border-line bg-white px-3 py-1 text-sm">
                {k}
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </>
  );
}

export default function ArticlePreviewPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

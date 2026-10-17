import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { loadArticleOptions } from "@/lib/admin/article-data";
import { FILE_COLUMNS, toAttached } from "@/lib/admin/files-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ArticleEditor } from "../article-editor";

export const metadata: Metadata = { title: "Edit article" };

type Props = PageProps<"/admin/articles/[id]">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/articles/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: a } = await supabase
    .from("articles")
    .select(
      `id, version, status, deleted_at, issue_id, category_id, title, slug, abstract, keywords, first_page, last_page, doi, citation_style, published_at,
       issue:issues!inner(status, deleted_at),
       pdf:stored_files!articles_pdf_file_id_fkey(${FILE_COLUMNS}),
       docx:stored_files!articles_docx_file_id_fkey(${FILE_COLUMNS}),
       authors:article_authors(full_name, affiliation, email, show_email, orcid, is_corresponding, position)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  const options = await loadArticleOptions(a.category_id);

  return (
    <>
      <AdminPageHeader
        title={a.title}
        crumbs={[{ href: "/admin/articles", label: "Articles" }, { label: "Edit" }]}
      />
      <ArticleEditor
        issues={options.issues}
        categories={options.categories}
        article={{
          id: a.id,
          version: a.version,
          status: a.status,
          deleted: Boolean(a.deleted_at),
          publicPath: `/articles/${a.slug}`,
          issuePublished: a.issue.status === "published" && !a.issue.deleted_at,
          issueId: a.issue_id,
          categoryId: a.category_id ?? "",
          title: a.title,
          slug: a.slug,
          abstract: a.abstract ?? "",
          keywords: a.keywords,
          firstPage: a.first_page ? String(a.first_page) : "",
          lastPage: a.last_page ? String(a.last_page) : "",
          doi: a.doi ?? "",
          citationStyle: a.citation_style,
          publishedAt: a.published_at?.slice(0, 10) ?? "",
          authors: [...a.authors]
            .sort((x, y) => x.position - y.position)
            .map((x) => ({
              fullName: x.full_name,
              affiliation: x.affiliation ?? "",
              email: x.email ?? "",
              showEmail: x.show_email,
              orcid: x.orcid ?? "",
              isCorresponding: x.is_corresponding,
            })),
          files: { article_pdf: toAttached(a.pdf), article_docx: toAttached(a.docx) },
        }}
      />
    </>
  );
}

export default function EditArticlePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

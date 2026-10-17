import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { loadArticleOptions } from "@/lib/admin/article-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { ArticleEditor } from "../article-editor";

export const metadata: Metadata = { title: "New article" };

async function Content({ searchParams }: { searchParams: PageProps<"/admin/articles/new">["searchParams"] }) {
  await requireRole(STAFF_ROLES, "/admin/articles/new");
  const { issue } = await searchParams;
  const options = await loadArticleOptions();
  const defaultIssueId =
    typeof issue === "string" && options.issues.some((i) => i.id === issue) ? issue : undefined;
  return (
    <ArticleEditor
      article={null}
      issues={options.issues}
      categories={options.categories}
      defaultIssueId={defaultIssueId}
    />
  );
}

export default function NewArticlePage({ searchParams }: PageProps<"/admin/articles/new">) {
  return (
    <>
      <AdminPageHeader
        title="New article"
        crumbs={[{ href: "/admin/articles", label: "Articles" }, { label: "New" }]}
      />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

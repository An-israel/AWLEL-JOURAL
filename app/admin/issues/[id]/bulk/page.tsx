import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BulkUploader } from "./bulk-uploader";

export const metadata: Metadata = { title: "Bulk upload" };

type Props = PageProps<"/admin/issues/[id]/bulk">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/issues/${id}/bulk`);
  const supabase = await createSupabaseServerClient();
  const [issues, { data: articles }, { data: categories }] = await Promise.all([
    loadAdminIssues(),
    supabase
      .from("articles")
      .select("id, version, title, first_page, authors:article_authors(full_name, position)")
      .eq("issue_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("categories").select("id, name, slug").eq("is_archived", false).order("sort_order"),
  ]);
  const issue = issues.find((i) => i.id === id);
  if (!issue) notFound();
  return (
    <>
      <AdminPageHeader
        title={`Bulk upload · ${issue.label}`}
        crumbs={[
          { href: "/admin/issues", label: "Volumes and Issues" },
          { href: `/admin/issues/${id}`, label: issue.label },
          { label: "Bulk upload" },
        ]}
      />
      <BulkUploader
        issueId={id}
        issueLabel={issue.label}
        categories={categories ?? []}
        existing={(articles ?? []).map((a) => ({
          id: a.id,
          version: a.version,
          title: a.title,
          firstPage: a.first_page,
          authors: [...a.authors].sort((x, y) => x.position - y.position).map((x) => x.full_name),
        }))}
      />
    </>
  );
}

export default function BulkPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

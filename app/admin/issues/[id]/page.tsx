import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { pageRange } from "@/components/catalog/page-range";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FILE_COLUMNS, toAttached } from "@/lib/admin/files-data";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { issuePath } from "@/lib/issue-label";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IssueEditor } from "./issue-editor";

export const metadata: Metadata = { title: "Edit issue" };

type Props = PageProps<"/admin/issues/[id]">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/issues/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: issue }, all, { data: articles }] = await Promise.all([
    supabase
      .from("issues")
      .select(
        `id, version, status, deleted_at, issue_number, month, legacy_number, title, editorial, cover_alt, published_at,
         cover:stored_files!issues_cover_file_id_fkey(${FILE_COLUMNS}),
         pdf:stored_files!issues_full_pdf_file_id_fkey(${FILE_COLUMNS}),
         docx:stored_files!issues_full_docx_file_id_fkey(${FILE_COLUMNS})`,
      )
      .eq("id", id)
      .maybeSingle(),
    loadAdminIssues(),
    supabase.from("articles").select("id, title, status, first_page, last_page").eq("issue_id", id).is("deleted_at", null).order("sort_order"),
  ]);
  if (!issue) notFound();
  const meta = all.find((i) => i.id === id)!;

  return (
    <>
      <AdminPageHeader title={meta.label} crumbs={[{ href: "/admin/issues", label: "Volumes and Issues" }, { label: meta.label }]} description={meta.legacyLabel ?? undefined} />
      <IssueEditor
        issue={{
          id: issue.id,
          version: issue.version,
          label: meta.label,
          publicPath: issuePath(meta.volumeNumber, meta.issueNumber),
          status: issue.status,
          deleted: Boolean(issue.deleted_at),
          issueNumber: issue.issue_number,
          month: issue.month,
          legacyNumber: issue.legacy_number,
          title: issue.title ?? "",
          editorial: issue.editorial ?? "",
          coverAlt: issue.cover_alt ?? "",
          publishedAt: issue.published_at?.slice(0, 10) ?? "",
          files: { issue_cover: toAttached(issue.cover), issue_pdf: toAttached(issue.pdf), issue_docx: toAttached(issue.docx) },
          articles: (articles ?? []).map((a) => ({ id: a.id, title: a.title, status: a.status, pages: pageRange(a.first_page, a.last_page) ?? "" })),
        }}
      />
    </>
  );
}

export default function EditIssuePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

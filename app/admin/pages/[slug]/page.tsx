import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MilestonesEditor } from "./milestones-editor";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Edit page" };

type Props = PageProps<"/admin/pages/[slug]">;

async function Content({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  await requireRole(["super_admin"], `/admin/pages/${slug}`);
  const supabase = await createSupabaseServerClient();
  const { data: page } = await supabase
    .from("pages")
    .select("id, slug, version, title, meta_description, content, needs_review")
    .eq("slug", slug)
    .maybeSingle();
  if (!page) notFound();
  // Recent saved versions for the History panel (item 76).
  const { data: revisions } = await supabase
    .from("page_revisions")
    .select("id, title, content, meta_description, saved_at, editor:profiles(full_name)")
    .eq("page_id", page.id)
    .order("saved_at", { ascending: false })
    .limit(30);
  const milestones =
    slug === "department"
      ? ((
          await supabase
            .from("department_milestones")
            .select("id, version, year_label, title, description, needs_verification")
            .order("sort_order")
        ).data ?? [])
      : null;
  return (
    <>
      <AdminPageHeader
        title={page.title}
        crumbs={[{ href: "/admin/pages", label: "Pages" }, { label: page.title }]}
      />
      <PageEditor
        page={{
          slug: page.slug,
          version: page.version,
          title: page.title,
          metaDescription: page.meta_description ?? "",
          content: page.content,
          needsReview: page.needs_review,
        }}
        revisions={(revisions ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          metaDescription: r.meta_description ?? "",
          savedAt: r.saved_at,
          savedBy: r.editor?.full_name || null,
        }))}
      />
      {milestones ? (
        <MilestonesEditor
          initial={milestones.map((m) => ({
            id: m.id,
            version: m.version,
            yearLabel: m.year_label,
            title: m.title,
            description: m.description ?? "",
            needsVerification: m.needs_verification,
          }))}
        />
      ) : null}
    </>
  );
}

export default function EditPagePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleRow } from "@/components/catalog/article-row";
import { IssueCover } from "@/components/catalog/issue-cover";
import { RichText } from "@/components/catalog/rich-text";
import { PreviewBanner } from "@/components/admin/preview-banner";
import { Badge } from "@/components/ui/badge";
import { previewArticles, previewIssueSummary } from "@/lib/admin/preview-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Issue preview" };

type Props = PageProps<"/admin/issues/[id]/preview">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/issues/${id}/preview`);
  const issue = await previewIssueSummary(id);
  if (!issue) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data }, articles] = await Promise.all([
    supabase.from("issues").select("status, editorial").eq("id", id).single(),
    previewArticles({ issueId: id }),
  ]);
  return (
    <>
      <PreviewBanner backHref={`/admin/issues/${id}`} status={data?.status ?? "draft"} />
      <div className="mt-8 grid gap-10 md:grid-cols-[14rem_1fr]">
        <IssueCover issue={issue} sizes="224px" />
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">
            {issue.legacyLabel ? `${issue.legacyLabel} · ` : ""}Issue
          </p>
          <h2 className="mt-2 text-4xl">{issue.label}</h2>
          {issue.title ? <p className="mt-2 text-lg text-ink-muted">{issue.title}</p> : null}
          <RichText html={data?.editorial ?? null} className="prose-reading mt-6" />
        </div>
      </div>
      <h3 className="mt-12 border-b-2 border-navy pb-3 text-2xl">Contents</h3>
      <div className="divide-y divide-line">
        {articles.map((a) => (
          <div key={a.id}>
            {/* Notes for the editor only: downloads stay off in previews, so say what readers will get. */}
            <p className="flex flex-wrap gap-1.5 pt-4" aria-label={`Preview notes for ${a.title}`}>
              {a.status === "draft" ? (
                <Badge variant="gold">Draft: hidden unless you publish it</Badge>
              ) : null}
              {a.hasPdf ? <Badge variant="green">PDF ready</Badge> : <Badge variant="coral">No PDF</Badge>}
              {a.hasDocx ? (
                <Badge variant="green">Word ready</Badge>
              ) : (
                <Badge variant="muted">No Word file</Badge>
              )}
            </p>
            <ArticleRow article={{ ...a, hasPdf: false, hasDocx: false }} />
          </div>
        ))}
      </div>
    </>
  );
}

export default function IssuePreviewPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

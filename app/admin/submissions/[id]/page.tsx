import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichText } from "@/components/catalog/rich-text";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmissionFileList } from "@/components/submissions/file-list";
import { StatusBadge } from "@/components/submissions/status-badge";
import { Timeline } from "@/components/submissions/timeline";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/roles";
import { RECOMMENDATION_LABELS } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateArticlePanel, ReviewersPanel, StatusPanel } from "./workflow-panels";

export const metadata: Metadata = { title: "Submission" };
type Props = PageProps<"/admin/submissions/[id]">;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const KIND_LABEL = {
  original: "Original",
  revision: "Revision",
  reviewer_annotated: "Reviewer's annotated file",
} as const;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/submissions/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: s }, { data: reviewers }, issues] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        `id, version, title, abstract, keywords, status, citation_style, cover_letter, declarations, created_at, article_id,
         category:categories(name),
         author:profiles!submissions_author_id_fkey(full_name, email),
         authors:submission_authors(full_name, affiliation, email, position, is_corresponding),
         files:submission_files(id, original_name, kind, version, created_at, size_bytes),
         events:submission_events(id, from_status, to_status, message, visible_to_author, created_at, actor:profiles(full_name)),
         assignments:review_assignments(id, reviewer_id, status, due_date, recommendation, comments, submitted_at, annotated_file_id, reviewer:profiles!review_assignments_reviewer_id_fkey(full_name, email))`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["reviewer", "editor", "super_admin"])
      .eq("is_active", true)
      .order("full_name"),
    loadAdminIssues(),
  ]);
  if (!s) notFound();

  const decl = (s.declarations ?? {}) as Record<string, unknown>;
  const submitted = s.assignments.filter((a) => a.status === "submitted");

  return (
    <>
      <AdminPageHeader
        title={s.title}
        crumbs={[{ href: "/admin/submissions", label: "Submissions" }, { label: "Manuscript" }]}
        actions={<StatusBadge status={s.status} />}
      />
      <div className="mt-6 grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <section className="rounded-lg border border-line bg-white p-5">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-ink-muted">Submitted</dt>
              <dd>{date.format(new Date(s.created_at))}</dd>
              <dt className="text-ink-muted">Category</dt>
              <dd>{s.category?.name ?? "—"}</dd>
              <dt className="text-ink-muted">Citation style</dt>
              <dd>{s.citation_style === "apa7" ? "APA 7th (References)" : "MLA 8th (Works Cited)"}</dd>
              <dt className="text-ink-muted">Keywords</dt>
              <dd>{s.keywords.join(", ") || "—"}</dd>
              <dt className="text-ink-muted">Declarations</dt>
              <dd>
                {decl.original && decl.notUnderReview && decl.followsGuidelines
                  ? "All three confirmed"
                  : "Incomplete"}
              </dd>
            </dl>
            <h2 className="mt-6 text-sm font-semibold tracking-wide text-ink-muted uppercase">Abstract</h2>
            <RichText html={s.abstract} className="prose-reading mt-2 text-base" />
          </section>

          <section aria-labelledby="au-title" className="rounded-lg border border-line bg-white p-5">
            <h2 id="au-title" className="text-base font-semibold">
              Authors <span className="text-xs font-normal text-ink-muted">(never shown to reviewers)</span>
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {[...s.authors]
                .sort((a, b) => a.position - b.position)
                .map((a) => (
                  <li key={a.position}>
                    <span className="font-medium">{a.full_name}</span>
                    {a.is_corresponding ? (
                      <span className="ml-1 text-xs text-ink-muted">(corresponding)</span>
                    ) : null}
                    <span className="text-ink-muted">
                      {a.affiliation ? ` · ${a.affiliation}` : ""}
                      {a.email ? ` · ${a.email}` : ""}
                    </span>
                  </li>
                ))}
            </ul>
            {s.cover_letter ? (
              <>
                <h3 className="mt-5 text-sm font-semibold tracking-wide text-ink-muted uppercase">
                  Cover letter
                </h3>
                <p className="mt-2 text-sm whitespace-pre-wrap">{s.cover_letter}</p>
              </>
            ) : null}
          </section>

          <section aria-labelledby="files-title" className="rounded-lg border border-line bg-white p-5">
            <h2 id="files-title" className="text-base font-semibold">
              Files
            </h2>
            <div className="mt-3">
              <SubmissionFileList
                empty="No manuscript has been uploaded. The author's upload may have failed; contact them."
                files={[...s.files]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((f) => ({
                    id: f.id,
                    label: f.original_name,
                    meta: `${KIND_LABEL[f.kind]}${f.kind !== "reviewer_annotated" ? ` v${f.version}` : ""} · ${date.format(new Date(f.created_at))}`,
                  }))}
              />
            </div>
          </section>

          <section aria-labelledby="reviews-title" className="rounded-lg border border-line bg-white p-5">
            <h2 id="reviews-title" className="text-base font-semibold">
              Reviews received ({submitted.length})
            </h2>
            {submitted.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No reviews submitted yet.</p>
            ) : (
              <div className="mt-4 space-y-6">
                {submitted.map((a) => (
                  <article key={a.id} className="border-l-2 border-gold-light pl-4">
                    <p className="text-sm">
                      <strong>{a.reviewer?.full_name}</strong> ·{" "}
                      {a.recommendation ? RECOMMENDATION_LABELS[a.recommendation] : ""} ·{" "}
                      <span className="text-ink-muted">
                        {a.submitted_at ? date.format(new Date(a.submitted_at)) : ""}
                      </span>
                    </p>
                    <RichText html={a.comments} className="prose-reading mt-2 text-base" />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="hist-title" className="rounded-lg border border-line bg-white p-5">
            <h2 id="hist-title" className="text-base font-semibold">
              History
            </h2>
            <div className="mt-4">
              <Timeline
                events={[...s.events]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((e) => ({
                    id: e.id,
                    createdAt: e.created_at,
                    fromStatus: e.from_status,
                    toStatus: e.to_status,
                    message: e.message,
                    actor: e.actor?.full_name,
                    internal: !e.visible_to_author,
                  }))}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <StatusPanel id={s.id} version={s.version} status={s.status} />
          <ReviewersPanel
            submissionId={s.id}
            assignments={s.assignments.map((a) => ({
              id: a.id,
              reviewerId: a.reviewer_id,
              reviewerName: a.reviewer?.full_name || a.reviewer?.email || "Reviewer",
              status: a.status,
              dueDate: a.due_date,
              recommendation: a.recommendation,
              submittedAt: a.submitted_at,
            }))}
            reviewers={(reviewers ?? []).map((r) => ({
              id: r.id,
              label: `${r.full_name || r.email} · ${ROLE_LABELS[r.role]}`,
            }))}
          />
          {s.status === "accepted" || s.article_id ? (
            <CreateArticlePanel
              submissionId={s.id}
              articleId={s.article_id}
              issues={issues.filter((i) => !i.deleted).map((i) => ({ id: i.id, label: i.label }))}
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}

export default function SubmissionDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

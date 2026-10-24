import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichText } from "@/components/catalog/rich-text";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmissionFileList } from "@/components/submissions/file-list";
import { isUnfinished, StatusBadge } from "@/components/submissions/status-badge";
import { Timeline } from "@/components/submissions/timeline";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/roles";
import { CLOSED_STATUSES, fileRoleLabel, RECOMMENDATION_LABELS } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateArticlePanel, ReviewersPanel, ShareReviewButton, StatusPanel } from "./workflow-panels";

export const metadata: Metadata = { title: "Submission" };
type Props = PageProps<"/admin/submissions/[id]">;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/submissions/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: s }, { data: reviewers }, issues] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        `id, version, title, abstract, keywords, status, citation_style, cover_letter, contact_email, contact_phone, declarations, created_at, article_id,
         finalised_at, review_round, revision_due_date,
         category:categories(name),
         author:profiles!submissions_author_id_fkey(full_name, email),
         authors:submission_authors(full_name, affiliation, email, position, is_corresponding),
         files:submission_files(id, original_name, kind, version, mime_type, author_response, created_at, size_bytes),
         events:submission_events(id, from_status, to_status, message, visible_to_author, created_at, actor:profiles(full_name)),
         assignments:review_assignments(id, reviewer_id, status, due_date, recommendation, comments, confidential_comments, submitted_at, annotated_file_id, round, response, decline_reason, shared_with_author_at, created_at, reviewer:profiles!review_assignments_reviewer_id_fkey(full_name, email))`,
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
  const assignments = [...s.assignments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Newest round first; previous rounds stay readable (item 58).
  const submitted = assignments
    .filter((a) => a.status === "submitted")
    .sort((a, b) => b.round - a.round || a.created_at.localeCompare(b.created_at));
  const responses = [...s.files]
    .filter((f) => f.kind === "revision" && f.author_response)
    .sort((a, b) => b.version - a.version);
  const unfinished = isUnfinished(s);

  return (
    <>
      <AdminPageHeader
        title={s.title}
        crumbs={[{ href: "/admin/submissions", label: "Submissions" }, { label: "Manuscript" }]}
        actions={<StatusBadge status={s.status} unfinished={unfinished} />}
      />
      <div className="mt-6 grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <section className="rounded-lg border border-line bg-white p-5">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-ink-muted">Submitted</dt>
              <dd>
                {date.format(new Date(s.created_at))}
                {unfinished ? (
                  <span className="ml-2 text-coral-ink">· not finished by the author</span>
                ) : null}
              </dd>
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
              {s.review_round > 1 ? (
                <>
                  <dt className="text-ink-muted">Review round</dt>
                  <dd>{s.review_round}</dd>
                </>
              ) : null}
              {s.status === "revisions_requested" && s.revision_due_date ? (
                <>
                  <dt className="text-ink-muted">Revision due</dt>
                  <dd>{day.format(new Date(s.revision_due_date))}</dd>
                </>
              ) : null}
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
            {s.contact_email || s.contact_phone ? (
              <dl className="mt-4 grid gap-x-6 gap-y-1 rounded-md bg-paper px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-medium text-ink-muted sm:col-span-2">How to reach the author</dt>
                {s.contact_email ? (
                  <>
                    <dt className="text-ink-muted">Email</dt>
                    <dd>
                      <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a>
                    </dd>
                  </>
                ) : null}
                {s.contact_phone ? (
                  <>
                    <dt className="text-ink-muted">Phone</dt>
                    <dd>
                      <a href={`tel:${s.contact_phone.replace(/[^\d+]/g, "")}`}>{s.contact_phone}</a>
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}
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
                empty="No manuscript has been uploaded yet. The submission is not finished until the author uploads it."
                files={[...s.files]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((f) => ({
                    id: f.id,
                    label: f.original_name,
                    meta: `${fileRoleLabel({ kind: f.kind, version: f.version, isPdf: f.mime_type === "application/pdf" })} · ${date.format(new Date(f.created_at))}`,
                  }))}
              />
            </div>
          </section>

          {responses.length ? (
            <section aria-labelledby="resp-title" className="rounded-lg border border-line bg-white p-5">
              <h2 id="resp-title" className="text-base font-semibold">
                Author&rsquo;s response to the reviewers
              </h2>
              <div className="mt-4 space-y-6">
                {responses.map((f) => (
                  <article key={f.id} className="border-l-2 border-gold-light pl-4">
                    <p className="text-sm text-ink-muted">
                      With revised manuscript v{f.version} · {date.format(new Date(f.created_at))}
                    </p>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{f.author_response}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

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
                      {a.recommendation ? RECOMMENDATION_LABELS[a.recommendation] : ""}
                      {s.review_round > 1 ? ` · round ${a.round}` : ""} ·{" "}
                      <span className="text-ink-muted">
                        {a.submitted_at ? date.format(new Date(a.submitted_at)) : ""}
                      </span>
                    </p>
                    <h3 className="mt-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      For the author
                    </h3>
                    <RichText html={a.comments} className="prose-reading mt-1 text-base" />
                    {a.confidential_comments ? (
                      <div className="mt-3 rounded-md bg-[#FBF3E4] px-3 py-2 text-sm text-[#7A4F18]">
                        <p className="text-xs font-semibold tracking-wide uppercase">
                          Confidential, for the editors only
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{a.confidential_comments}</p>
                      </div>
                    ) : null}
                    {a.comments ? (
                      <ShareReviewButton
                        assignmentId={a.id}
                        submissionId={s.id}
                        sharedAt={a.shared_with_author_at}
                      />
                    ) : null}
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

        {/* The panels editors act in come first on phones (item 67). */}
        <aside className="order-first space-y-6 xl:order-none">
          <StatusPanel id={s.id} version={s.version} status={s.status} unfinished={unfinished} />
          <ReviewersPanel
            submissionId={s.id}
            round={s.review_round}
            closed={CLOSED_STATUSES.includes(s.status)}
            assignments={assignments.map((a) => ({
              id: a.id,
              reviewerId: a.reviewer_id,
              reviewerName: a.reviewer?.full_name || a.reviewer?.email || "Reviewer",
              status: a.status,
              dueDate: a.due_date,
              recommendation: a.recommendation,
              submittedAt: a.submitted_at,
              round: a.round,
              response: a.response,
              declineReason: a.decline_reason,
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

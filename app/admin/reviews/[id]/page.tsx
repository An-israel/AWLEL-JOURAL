import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichText } from "@/components/catalog/rich-text";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmissionFileList } from "@/components/submissions/file-list";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { ADMIN_AREA_ROLES } from "@/lib/roles";
import { fileRoleLabel, RECOMMENDATION_LABELS } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvitationResponse } from "./invitation-response";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Review" };
type Props = PageProps<"/admin/reviews/[id]">;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const user = await requireRole(ADMIN_AREA_ROLES, `/admin/reviews/${id}`);
  const flags = await getFeatureFlags();
  if (!flags.reviewer_module)
    return <p className="mt-8 text-ink-muted">The review module is switched off at the moment.</p>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: queue } = await supabase.rpc("reviewer_queue");
  const a = queue?.find((q) => q.assignment_id === id);
  if (!a) notFound();
  // Reviewers see manuscripts only through reviewer_files() (no names or
  // uploader), plus the annotated file they uploaded themselves.
  const [{ data: assignedFiles }, { data: ownFiles }] = await Promise.all([
    supabase.rpc("reviewer_files"),
    supabase
      .from("submission_files")
      .select("id, original_name, created_at")
      .eq("submission_id", a.submission_id)
      .eq("kind", "reviewer_annotated")
      .eq("uploaded_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const manuscripts = (assignedFiles ?? [])
    .filter((f) => f.submission_id === a.submission_id)
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map((f) => ({
      id: f.file_id,
      kind: f.kind,
      version: f.version,
      isPdf: f.is_pdf,
      created_at: f.created_at,
    }));
  const annotated = ownFiles?.[0] ?? null;

  return (
    <>
      <AdminPageHeader
        title={a.title}
        crumbs={[{ href: "/admin/reviews", label: "Reviews" }, { label: "Manuscript" }]}
        description={
          a.round > 1 ? `Review round ${a.round}: a revised version of the manuscript.` : undefined
        }
      />
      {a.assignment_status === "pending" && !a.response ? (
        <InvitationResponse assignmentId={a.assignment_id} />
      ) : null}
      <div
        role="note"
        className="mt-6 rounded-lg border border-gold bg-[#FBF3E4] px-4 py-3 text-sm text-[#7A4F18]"
      >
        <strong>Blind review.</strong> The author&rsquo;s identity is not shown to you, and your identity is
        not shared with the author. If you recognise the author, please tell the editors.
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <section className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-ink-muted">
              {a.category_name ?? "No category"} · {a.citation_style === "apa7" ? "APA 7th" : "MLA 8th"}
              {a.keywords.length ? ` · ${a.keywords.join(", ")}` : ""}
            </p>
            <h2 className="mt-4 text-sm font-semibold tracking-wide text-ink-muted uppercase">Abstract</h2>
            <RichText html={a.abstract} className="prose-reading mt-2 text-base" />
          </section>
          <section className="rounded-lg border border-line bg-white p-5">
            {a.assignment_status === "submitted" ? (
              <>
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold">Your review</h2>
                  <Badge variant="green">
                    Submitted {a.submitted_at ? date.format(new Date(a.submitted_at)) : ""}
                  </Badge>
                </div>
                <p className="mt-3 text-sm">
                  Recommendation:{" "}
                  <strong>{a.recommendation ? RECOMMENDATION_LABELS[a.recommendation] : "—"}</strong>
                </p>
                <RichText html={a.comments} className="prose-reading mt-3 text-base" />
                {a.confidential_comments ? (
                  <div className="mt-4 rounded-md bg-[#FBF3E4] px-3 py-2 text-sm text-[#7A4F18]">
                    <p className="text-xs font-semibold tracking-wide uppercase">
                      Confidential, for the editors only
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{a.confidential_comments}</p>
                  </div>
                ) : null}
                {annotated ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold">Your marked-up file</h3>
                    <div className="mt-2">
                      <SubmissionFileList
                        files={[
                          {
                            id: annotated.id,
                            label: annotated.original_name,
                            meta: `Reviewer's marked-up file · ${date.format(new Date(annotated.created_at))}`,
                          },
                        ]}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <ReviewForm
                assignmentId={a.assignment_id}
                submissionId={a.submission_id}
                version={a.assignment_version}
                comments={a.comments ?? ""}
                confidentialComments={a.confidential_comments ?? ""}
                recommendation={a.recommendation}
                annotatedFileId={annotated?.id ?? null}
                annotatedFileName={annotated?.original_name ?? null}
              />
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-base font-semibold">Manuscript</h2>
            <div className="mt-3">
              <SubmissionFileList
                files={manuscripts.map((f) => ({
                  id: f.id,
                  // Labelled by role, not by a per-kind count (item 64).
                  label: fileRoleLabel({ kind: f.kind, version: f.version, isPdf: f.isPdf }),
                  meta: date.format(new Date(f.created_at)),
                }))}
              />
            </div>
          </section>
          <section className="rounded-lg border border-line bg-white p-5 text-sm">
            <h2 className="text-base font-semibold">Due</h2>
            <p className="mt-2">{a.due_date ? date.format(new Date(a.due_date)) : "No due date set"}</p>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function ReviewPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

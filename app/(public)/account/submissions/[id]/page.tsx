import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmissionFileList } from "@/components/submissions/file-list";
import { isUnfinished, StatusBadge } from "@/components/submissions/status-badge";
import { Timeline } from "@/components/submissions/timeline";
import { Toaster } from "@/components/ui/toaster";
import { requireUser } from "@/lib/auth";
import { fileRoleLabel, STATUS_HELP, WITHDRAWABLE_STATUSES } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EditDetails, FinishSubmission, WithdrawSubmission } from "./author-panels";
import { RevisionUpload } from "./revision-upload";

export const metadata: Metadata = { title: "Submission", robots: { index: false } };
type Props = PageProps<"/account/submissions/[id]">;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** The stored abstract is simple paragraphs of HTML; turn it back into editable text. */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

async function Content({ params, searchParams }: Props) {
  const { id } = await params;
  const user = await requireUser(`/account/submissions/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { submitted } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase
    .from("submissions")
    .select(
      "id, version, title, abstract, status, created_at, finalised_at, revision_due_date, keywords, citation_style, category:categories(name), authors:submission_authors(full_name, affiliation, email, position, is_corresponding), files:submission_files(id, original_name, kind, version, mime_type, created_at), events:submission_events(id, from_status, to_status, message, created_at)",
    )
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!s) notFound();

  // Never finished (item 51): details saved, but the Word manuscript didn't arrive.
  const unfinished = isUnfinished(s);
  const authors = [...s.authors].sort((a, b) => a.position - b.position);

  return (
    <>
      {submitted && !unfinished ? (
        <div
          role="status"
          className="mb-8 rounded-lg border border-[#2F6B22]/30 bg-[#EAF5E6] p-5 text-[#2F6B22]"
        >
          <p className="font-semibold">Thank you — your manuscript has been submitted.</p>
          <p className="mt-1 text-sm">
            We&rsquo;ve emailed you a confirmation. You can follow its progress on this page.
          </p>
        </div>
      ) : null}
      <Link href="/account/submissions" className="text-sm">
        ← My submissions
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-3xl text-3xl">{s.title}</h1>
        <StatusBadge status={s.status} unfinished={unfinished} />
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {unfinished ? "Started" : "Submitted"} {date.format(new Date(s.created_at))} ·{" "}
        {s.category?.name ?? "No category"} · {s.citation_style === "apa7" ? "APA 7th" : "MLA 8th"}
      </p>
      {!unfinished ? (
        <p className="mt-4 max-w-2xl rounded-md bg-white px-4 py-3 text-sm ring-1 ring-line">
          {STATUS_HELP[s.status]}
        </p>
      ) : null}
      {s.status === "submitted" || WITHDRAWABLE_STATUSES.includes(s.status) ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {s.status === "submitted" && !unfinished ? (
            <EditDetails
              submissionId={s.id}
              version={s.version}
              title={s.title}
              abstract={plainText(s.abstract)}
              keywords={s.keywords}
              coAuthors={authors
                .filter((a) => !a.is_corresponding)
                .map((a) => ({
                  fullName: a.full_name,
                  affiliation: a.affiliation ?? "",
                  email: a.email ?? "",
                }))}
            />
          ) : null}
          {WITHDRAWABLE_STATUSES.includes(s.status) ? (
            <WithdrawSubmission submissionId={s.id} unfinished={unfinished} />
          ) : null}
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          {unfinished ? <FinishSubmission submissionId={s.id} /> : null}
          {s.status === "revisions_requested" ? (
            <RevisionUpload submissionId={s.id} dueDate={s.revision_due_date} />
          ) : null}
          <section aria-labelledby="files-title">
            <h2 id="files-title" className="text-lg font-semibold">
              Your files
            </h2>
            <div className="mt-3">
              <SubmissionFileList
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
          <section aria-labelledby="authors-title">
            <h2 id="authors-title" className="text-lg font-semibold">
              Authors
            </h2>
            <ul className="mt-3 space-y-1 text-sm">
              {authors.map((a) => (
                <li key={a.position}>
                  {a.full_name}
                  {a.affiliation ? <span className="text-ink-muted"> · {a.affiliation}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="text-lg font-semibold">
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
                }))}
            />
          </div>
        </section>
      </div>
      <Toaster />
    </>
  );
}

export default function SubmissionPage(props: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
  SUBMISSION_STATUSES,
  type Recommendation,
  type SubmissionStatus,
} from "@/lib/submission-status";
import {
  assignReviewer,
  changeSubmissionStatus,
  createArticleFromSubmission,
  withdrawAssignment,
} from "../actions";

export function StatusPanel({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: SubmissionStatus;
}) {
  const router = useRouter();
  const [next, setNext] = useState<SubmissionStatus>(status);
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="status-title" className="space-y-3 rounded-lg border border-line bg-white p-5">
      <h2 id="status-title" className="text-base font-semibold">
        Status
      </h2>
      <ConflictBanner show={conflict} />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await changeSubmissionStatus({
              id,
              expectedVersion: version,
              status: next,
              message,
              notifyAuthor: notify,
            });
            if (!r.ok) {
              if (r.conflict) setConflict(true);
              return void toast.error(r.message);
            }
            toast.success(r.message ?? "Saved");
            setMessage("");
            router.refresh();
          });
        }}
      >
        <div>
          <Label htmlFor="st-next">New status</Label>
          <NativeSelect
            id="st-next"
            value={next}
            onChange={(e) => setNext(e.target.value as SubmissionStatus)}
            className="mt-1.5"
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="st-msg">Message to the author (optional)</Label>
          <Textarea
            id="st-msg"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1.5"
            placeholder="For example, the changes the reviewers asked for. Never include reviewer names."
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Show on the
          author&rsquo;s timeline and email them
        </label>
        <Button type="submit" disabled={pending || (next === status && !message)}>
          {pending ? "Saving…" : next === status ? "Add note" : `Change to ${STATUS_LABELS[next]}`}
        </Button>
      </form>
    </section>
  );
}

export interface AssignmentRow {
  id: string;
  reviewerId: string;
  reviewerName: string;
  status: "pending" | "submitted" | "withdrawn";
  dueDate: string | null;
  recommendation: Recommendation | null;
  submittedAt: string | null;
}

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function ReviewersPanel({
  submissionId,
  assignments,
  reviewers,
}: {
  submissionId: string;
  assignments: AssignmentRow[];
  reviewers: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [reviewerId, setReviewerId] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string>();
  const [withdrawing, setWithdrawing] = useState<AssignmentRow | null>(null);
  const [pending, start] = useTransition();
  const assigned = new Set(assignments.filter((a) => a.status !== "withdrawn").map((a) => a.reviewerId));

  return (
    <section aria-labelledby="rev-title" className="space-y-4 rounded-lg border border-line bg-white p-5">
      <h2 id="rev-title" className="text-base font-semibold">
        Reviewers
      </h2>
      {assignments.length === 0 ? (
        <p className="text-sm text-ink-muted">No reviewers assigned yet.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">{a.reviewerName}</span>
                <span className="block text-xs text-ink-muted">
                  {a.status === "submitted" && a.submittedAt
                    ? `Reviewed ${date.format(new Date(a.submittedAt))}`
                    : a.status === "withdrawn"
                      ? "Withdrawn"
                      : a.dueDate
                        ? `Due ${date.format(new Date(a.dueDate))}`
                        : "No due date"}
                </span>
              </span>
              {a.status === "submitted" && a.recommendation ? (
                <Badge
                  variant={
                    a.recommendation === "accept" ? "green" : a.recommendation === "reject" ? "coral" : "gold"
                  }
                >
                  {RECOMMENDATION_LABELS[a.recommendation]}
                </Badge>
              ) : a.status === "pending" ? (
                <Button size="sm" variant="ghost" onClick={() => setWithdrawing(a)}>
                  Withdraw
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await assignReviewer({ submissionId, reviewerId, dueDate: due });
            if (!r.ok) {
              setError(r.fieldErrors?.reviewerId ?? r.message);
              return void toast.error(r.message);
            }
            setError(undefined);
            setReviewerId("");
            toast.success(r.message ?? "Assigned");
            router.refresh();
          });
        }}
      >
        <div>
          <Label htmlFor="rv-who">Assign a reviewer</Label>
          <NativeSelect
            id="rv-who"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="mt-1.5"
            aria-describedby="rv-who-error"
          >
            <option value="">Choose…</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id} disabled={assigned.has(r.id)}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="rv-who-error">{error}</FieldError>
        </div>
        <div>
          <Label htmlFor="rv-due">Due date</Label>
          <Input
            id="rv-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || !reviewerId}>
          Assign and email invitation
        </Button>
        <p className="text-xs text-ink-muted">
          Reviewers are invited from <Link href="/admin/users">Users and Roles</Link>.
        </p>
      </form>
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title={`Withdraw ${withdrawing?.reviewerName ?? ""}?`}
        description="They lose access to the manuscript straight away. Their assignment stays in the history."
        confirmLabel="Withdraw"
        destructive
        onConfirm={() => {
          const a = withdrawing;
          if (!a) return;
          start(async () => {
            const r = await withdrawAssignment({ assignmentId: a.id, submissionId });
            setWithdrawing(null);
            if (!r.ok) return void toast.error(r.message);
            toast.success(r.message ?? "Withdrawn");
            router.refresh();
          });
        }}
      />
    </section>
  );
}

export function CreateArticlePanel({
  submissionId,
  issues,
  articleId,
}: {
  submissionId: string;
  issues: { id: string; label: string }[];
  articleId: string | null;
}) {
  const router = useRouter();
  const [issueId, setIssueId] = useState("");
  const [pending, start] = useTransition();
  if (articleId) {
    return (
      <section className="rounded-lg border border-[#2F6B22]/30 bg-[#EAF5E6] p-5 text-sm">
        <p className="font-semibold text-[#2F6B22]">An article has been created from this submission.</p>
        <Link href={`/admin/articles/${articleId}`} className="mt-2 inline-block font-semibold">
          Open the article →
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="ca-title" className="space-y-3 rounded-lg border border-line bg-white p-5">
      <h2 id="ca-title" className="text-base font-semibold">
        Create article from submission
      </h2>
      <p className="text-sm text-ink-muted">
        Pre-fills a draft article with this manuscript&rsquo;s details and authors. You then attach the final
        formatted files.
      </p>
      <div>
        <Label htmlFor="ca-issue">Issue</Label>
        <NativeSelect
          id="ca-issue"
          value={issueId}
          onChange={(e) => setIssueId(e.target.value)}
          className="mt-1.5"
        >
          <option value="">Choose an issue…</option>
          {issues.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        disabled={pending || !issueId}
        onClick={() =>
          start(async () => {
            const r = await createArticleFromSubmission({ submissionId, issueId });
            if (!r.ok) return void toast.error(r.message);
            toast.success(r.message ?? "Created");
            if (r.data) router.push(`/admin/articles/${r.data.articleId}`);
          })
        }
      >
        Create draft article
      </Button>
    </section>
  );
}

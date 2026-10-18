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
  NEXT_STATUSES,
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
  type Recommendation,
  type SubmissionStatus,
} from "@/lib/submission-status";
import {
  assignReviewer,
  changeSubmissionStatus,
  createArticleFromSubmission,
  shareReviewWithAuthor,
  withdrawAssignment,
} from "../actions";

const fourWeeksFromToday = () => new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);

export function StatusPanel({
  id,
  version,
  status,
  unfinished,
}: {
  id: string;
  version: number;
  status: SubmissionStatus;
  unfinished: boolean;
}) {
  const router = useRouter();
  // Only the moves allowed from here (item 56); "no change" adds a note (item 55).
  const choices = unfinished ? [] : NEXT_STATUSES[status];
  const [next, setNext] = useState<SubmissionStatus>(status);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState(true);
  const [due, setDue] = useState(fourWeeksFromToday);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  const isNote = next === status;
  const reopening = status === "rejected" && next === "under_review";
  return (
    <section aria-labelledby="status-title" className="space-y-3 rounded-lg border border-line bg-white p-5">
      <h2 id="status-title" className="text-base font-semibold">
        Status
      </h2>
      <ConflictBanner show={conflict} />
      {unfinished ? (
        <p className="rounded-md bg-[#FDECEF] px-3 py-2 text-sm text-[#A3283C]">
          Not finished: the author hasn&rsquo;t uploaded the Word manuscript yet, so the status can&rsquo;t
          change. You can still add a note.
        </p>
      ) : NEXT_STATUSES[status].length === 0 ? (
        <p className="text-sm text-ink-muted">
          {status === "withdrawn"
            ? "This submission was withdrawn. Its status can't change any more."
            : "This submission is published. Its status can't change any more."}
        </p>
      ) : null}
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await changeSubmissionStatus({
              id,
              expectedVersion: version,
              status: next,
              message,
              visibleToAuthor: visible,
              emailAuthor: email,
              revisionDueDate: next === "revisions_requested" ? due : "",
            });
            if (!r.ok) {
              if (r.conflict) setConflict(true);
              setError(r.fieldErrors?.message);
              return void toast.error(r.message);
            }
            setError(undefined);
            toast.success(r.message ?? "Saved");
            setMessage("");
            setNext(status);
            router.refresh();
          });
        }}
      >
        {choices.length ? (
          <div>
            <Label htmlFor="st-next">New status</Label>
            <NativeSelect
              id="st-next"
              value={next}
              onChange={(e) => setNext(e.target.value as SubmissionStatus)}
              className="mt-1.5"
            >
              <option value={status}>No change: add a note</option>
              {choices.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {next === "revisions_requested" && !isNote ? (
          <div>
            <Label htmlFor="st-due">Revision due by</Label>
            <Input
              id="st-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1.5"
              aria-describedby="st-due-hint"
            />
            <p id="st-due-hint" className="mt-1 text-xs text-ink-muted">
              Shown to the author. Once it has passed, they get a reminder at most once a week.
            </p>
          </div>
        ) : null}
        <div>
          <Label htmlFor="st-msg">
            {isNote
              ? "Note"
              : reopening
                ? "Why it is being reopened (required)"
                : "Message to the author (optional)"}
          </Label>
          <Textarea
            id="st-msg"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1.5"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "st-msg-error" : undefined}
            placeholder="For example, the changes the reviewers asked for. Never include reviewer names."
          />
          <FieldError id="st-msg-error">{error}</FieldError>
        </div>
        {/* Two separate choices (item 63); an email always shows on the timeline too. */}
        <fieldset className="space-y-1.5 text-sm">
          <legend className="sr-only">Who sees this</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={visible || email}
              disabled={email}
              onChange={(e) => setVisible(e.target.checked)}
            />{" "}
            Show on the author&rsquo;s timeline
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email the
            author
          </label>
          {email ? (
            <p className="text-xs text-ink-muted">An email always shows on the timeline too.</p>
          ) : null}
        </fieldset>
        <Button type="submit" disabled={pending || (isNote && !message.trim())}>
          {pending ? "Saving…" : isNote ? "Add note" : `Change to ${STATUS_LABELS[next]}`}
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
  round: number;
  response: string | null;
  declineReason: string | null;
}

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** What the editors need to know about an invitation (item 60). */
function assignmentState(a: AssignmentRow): string {
  if (a.status === "submitted" && a.submittedAt) return `Reviewed ${date.format(new Date(a.submittedAt))}`;
  if (a.response === "declined") return a.declineReason ? `Declined: ${a.declineReason}` : "Declined";
  if (a.status === "withdrawn") return "Withdrawn";
  const due = a.dueDate ? ` · due ${date.format(new Date(a.dueDate))}` : "";
  return a.response === "accepted" ? `Accepted${due}` : `Awaiting reply${due}`;
}

export function ReviewersPanel({
  submissionId,
  round,
  closed,
  assignments,
  reviewers,
}: {
  submissionId: string;
  round: number;
  closed: boolean;
  assignments: AssignmentRow[];
  reviewers: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [reviewerId, setReviewerId] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string>();
  const [withdrawing, setWithdrawing] = useState<AssignmentRow | null>(null);
  const [pending, start] = useTransition();
  // Taken in this round only: earlier rounds' reviewers can be invited again (item 58).
  const assigned = new Set(
    assignments.filter((a) => a.round === round && a.status !== "withdrawn").map((a) => a.reviewerId),
  );
  const rounds = [...new Set(assignments.map((a) => a.round))].sort((a, b) => b - a);

  return (
    <section aria-labelledby="rev-title" className="space-y-4 rounded-lg border border-line bg-white p-5">
      <h2 id="rev-title" className="text-base font-semibold">
        Reviewers
        {round > 1 ? <span className="ml-2 text-sm font-normal text-ink-muted">· round {round}</span> : null}
      </h2>
      {assignments.length === 0 ? (
        <p className="text-sm text-ink-muted">No reviewers assigned yet.</p>
      ) : (
        rounds.map((r) => (
          <div key={r}>
            {rounds.length > 1 ? (
              <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Round {r}</h3>
            ) : null}
            <ul className="divide-y divide-line text-sm">
              {assignments
                .filter((a) => a.round === r)
                .map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="font-medium">{a.reviewerName}</span>
                      <span className="block text-xs break-words text-ink-muted">{assignmentState(a)}</span>
                    </span>
                    {a.status === "submitted" && a.recommendation ? (
                      <Badge
                        variant={
                          a.recommendation === "accept"
                            ? "green"
                            : a.recommendation === "reject"
                              ? "coral"
                              : "gold"
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
          </div>
        ))
      )}
      {closed ? (
        <p className="border-t border-line pt-4 text-sm text-ink-muted">
          A decision has been made, so no more reviewers can be invited.
        </p>
      ) : (
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
            Reviewers are invited from <Link href="/admin/users">Users and Roles</Link>. When a revised
            manuscript goes back to review, a new round starts and earlier reviewers can be invited again.
          </p>
        </form>
      )}
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title={`Withdraw ${withdrawing?.reviewerName ?? ""}?`}
        description="They lose access to the manuscript straight away and are told by email that their review is no longer needed. Their assignment stays in the history."
        confirmLabel="Withdraw"
        destructive
        onConfirm={() => {
          const a = withdrawing;
          if (!a) return;
          start(async () => {
            const r = await withdrawAssignment({ assignmentId: a.id, submissionId });
            setWithdrawing(null);
            if (r.ok) toast.success(r.message ?? "Withdrawn");
            else toast.error(r.message);
            router.refresh();
          });
        }}
      />
    </section>
  );
}

/** "Share with the author" for one review (item 52): anonymous, comments for the author only. */
export function ShareReviewButton({
  assignmentId,
  submissionId,
  sharedAt,
}: {
  assignmentId: string;
  submissionId: string;
  sharedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (sharedAt) {
    return (
      <p className="mt-2 text-xs text-ink-muted">
        Shared with the author on {date.format(new Date(sharedAt))}, without the reviewer&rsquo;s name.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline" disabled={pending}>
            Share with the author
          </Button>
        }
        title="Share these comments with the author?"
        description="The comments are copied to the author's timeline as “Reviewer N”. The reviewer's name, their confidential comments to the editors and their marked-up file are not shared. No email is sent, so mention it in your next message to the author."
        confirmLabel="Share"
        onConfirm={() =>
          start(async () => {
            const r = await shareReviewWithAuthor({ assignmentId, submissionId });
            if (!r.ok) return void toast.error(r.message);
            toast.success(r.message ?? "Shared");
            router.refresh();
          })
        }
      />
    </div>
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
        <p className="mt-1 text-[#2F6B22]">
          When the article and its issue are both published, this submission becomes &ldquo;Published&rdquo;
          and the author is emailed.
        </p>
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

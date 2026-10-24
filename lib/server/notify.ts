import "server-only";
import { serverEnv } from "@/lib/env.server";
import { siteUrl } from "@/lib/env.public";
import { RECOMMENDATION_LABELS, type Recommendation, type SubmissionStatus } from "@/lib/submission-status";
import {
  longDate,
  noteEmail,
  revisionReminderEmail,
  SIGN_OFF,
  statusEmail,
  type AuthorEmail,
} from "@/lib/submissions/emails";
import { enqueueJob, runJobNow } from "./jobs";
import { logger } from "./logger";

/*
 * Workflow emails (section 7). Each is queued with an idempotency key (so a
 * retried request never sends twice) and attempted at once; failures stay
 * queued for the worker. Reviewer emails never name the author, and author
 * emails never name the reviewer (blinding). Author-facing wording lives in
 * lib/submissions/emails.ts.
 */

const STAFF_SIGN_OFF = "\n\n— AWLEL website";

async function send(to: string, subject: string, text: string, key: string, replyTo?: string) {
  const jobId = await enqueueJob("email.send", { to, subject, text, replyTo }, key);
  if (jobId) await runJobNow(jobId).catch((err: unknown) => logger.warn({ err, key }, "email deferred"));
}

const toAuthor = (to: string, email: AuthorEmail, key: string) =>
  send(to, email.subject, email.text, key, serverEnv().EDITORIAL_EMAIL);
const toEditors = (subject: string, text: string, key: string) =>
  send(serverEnv().EDITORIAL_EMAIL, `[AWLEL] ${subject}`, text + STAFF_SIGN_OFF, key);
const submissionLink = (id: string) => `${siteUrl}/account/submissions/${id}`;
const adminLink = (id: string) => `${siteUrl}/admin/submissions/${id}`;

export async function notifySubmissionReceived(s: {
  id: string;
  title: string;
  authorEmail: string;
  authorName: string;
  contactPhone?: string | null;
}) {
  const contact = [
    `Author: ${s.authorName || "(no name)"}`,
    `Email: ${s.authorEmail}`,
    s.contactPhone ? `Phone: ${s.contactPhone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  await Promise.all([
    send(
      s.authorEmail,
      `Manuscript received: ${s.title}`,
      `Dear ${s.authorName || "author"},\n\nThank you for submitting “${s.title}” to AWLEL. We have received your manuscript and will let you know as it moves through screening and review.\n\nYou can follow its progress at any time:\n${submissionLink(s.id)}${SIGN_OFF}`,
      `submission-received:${s.id}`,
    ),
    toEditors(
      `New submission: ${s.title}`,
      `A new manuscript has been submitted.\n\nTitle: ${s.title}\n${contact}\n\nOpen it in the editorial dashboard:\n${adminLink(s.id)}`,
      `submission-received-editors:${s.id}`,
    ),
  ]);
}

export async function notifyStatusChanged(s: {
  id: string;
  title: string;
  authorEmail: string;
  authorName: string;
  status: SubmissionStatus;
  message: string | null;
  eventKey: string;
  revisionDueDate?: string | null;
  articleUrl?: string | null;
}) {
  await toAuthor(s.authorEmail, statusEmail({ ...s, link: submissionLink(s.id) }), `status:${s.eventKey}`);
}

/** A note on the timeline without a status change (item 55); keyed by the event id. */
export async function notifyNote(s: {
  id: string;
  eventId: string;
  title: string;
  authorEmail: string;
  authorName: string;
  message: string;
}) {
  await toAuthor(s.authorEmail, noteEmail({ ...s, link: submissionLink(s.id) }), `note:${s.eventId}`);
}

export async function notifyReviewerAssigned(r: {
  assignmentId: string;
  reviewerEmail: string;
  reviewerName: string;
  title: string;
  dueDate: string | null;
  round: number;
  /** The assignment's version after the invitation, so a re-invitation is a new email (item 58). */
  version: number;
}) {
  const due = r.dueDate ? `\n\nWe would be grateful for your review by ${longDate(r.dueDate)}.` : "";
  const what =
    r.round > 1
      ? `a revised version (review round ${r.round}) of the manuscript “${r.title}”`
      : `the manuscript “${r.title}”`;
  await send(
    r.reviewerEmail,
    r.round > 1 ? `Review invitation (round ${r.round}): ${r.title}` : `Review invitation: ${r.title}`,
    `Dear ${r.reviewerName || "colleague"},\n\nThe editors of AWLEL invite you to review ${what}. Review is double-blind: the author's identity is not shared with you, and yours is not shared with the author.${due}\n\nPlease let us know whether you can take it on: open the link below and choose Accept or Decline. The manuscript and review form are on the same page:\n${siteUrl}/admin/reviews/${r.assignmentId}${SIGN_OFF}`,
    `review-assigned:${r.assignmentId}:r${r.round}:v${r.version}`,
    serverEnv().EDITORIAL_EMAIL,
  );
}

/** The editors withdrew the invitation, or a decision made the review unnecessary (items 59, 62). */
export async function notifyReviewNoLongerNeeded(r: {
  assignmentId: string;
  reviewerEmail: string;
  reviewerName: string;
  title: string;
  reason: "withdrawn" | "decision";
  version: number;
}) {
  const why =
    r.reason === "decision"
      ? "The editors have now reached a decision on this manuscript, so your review is no longer needed."
      : "The editors have withdrawn this review request, so your review is no longer needed.";
  await send(
    r.reviewerEmail,
    `Review no longer needed: ${r.title}`,
    `Dear ${r.reviewerName || "colleague"},\n\nThank you for agreeing to help with “${r.title}”. ${why} Please don't spend any more time on it, and accept our apologies if you had already started.\n\nWe are grateful for your support of the journal and hope to call on your expertise again.${SIGN_OFF}`,
    `review-closed:${r.assignmentId}:v${r.version}`,
    serverEnv().EDITORIAL_EMAIL,
  );
}

export async function notifyReviewSubmitted(r: {
  assignmentId: string;
  submissionId: string;
  title: string;
  recommendation: Recommendation;
}) {
  await toEditors(
    `Review received: ${r.title}`,
    `A reviewer has submitted their review of “${r.title}”.\n\nRecommendation: ${RECOMMENDATION_LABELS[r.recommendation]}\n\nRead it in the editorial dashboard:\n${adminLink(r.submissionId)}`,
    `review-submitted:${r.assignmentId}`,
  );
}

/** A reviewer declined the invitation (item 60). */
export async function notifyReviewDeclined(r: {
  assignmentId: string;
  submissionId: string;
  title: string;
  reviewerName: string;
  reason: string | null;
}) {
  await toEditors(
    `Review declined: ${r.title}`,
    `${r.reviewerName} has declined the invitation to review “${r.title}”.${r.reason ? `\n\nTheir reason:\n${r.reason}` : ""}\n\nYou may want to invite another reviewer:\n${adminLink(r.submissionId)}`,
    `review-declined:${r.assignmentId}`,
  );
}

export async function notifyRevisionUploaded(s: {
  id: string;
  title: string;
  fileId: string;
  response: string | null;
}) {
  await toEditors(
    `Revised manuscript: ${s.title}`,
    `The author has uploaded a revised manuscript for “${s.title}”. It is now marked “Revision received”.${s.response ? `\n\nThe author's response to the reviewers:\n${s.response}` : ""}\n\nOpen the submission:\n${adminLink(s.id)}`,
    `revision:${s.fileId}`,
  );
}

/** The author withdrew their submission (item 53). */
export async function notifySubmissionWithdrawn(s: {
  id: string;
  title: string;
  reason: string | null;
  authorEmail: string;
  authorName: string;
}) {
  await Promise.all([
    toEditors(
      `Submission withdrawn: ${s.title}`,
      `The author has withdrawn “${s.title}”.${s.reason ? `\n\nTheir reason:\n${s.reason}` : ""}\n\nOutstanding reviews have been closed. The submission:\n${adminLink(s.id)}`,
      `withdrawn-editors:${s.id}`,
    ),
    toAuthor(
      s.authorEmail,
      statusEmail({
        status: "withdrawn",
        title: s.title,
        authorName: s.authorName,
        message: null,
        link: submissionLink(s.id),
      }),
      `withdrawn:${s.id}`,
    ),
  ]);
}

/** Daily cron: a pending review is due within three days or overdue. */
export async function notifyReviewReminder(r: {
  assignmentId: string;
  reviewerEmail: string;
  reviewerName: string;
  title: string;
  dueDate: string;
  today: string;
}) {
  const due = longDate(r.dueDate);
  const overdue = r.dueDate < r.today;
  await send(
    r.reviewerEmail,
    overdue ? `Review overdue: ${r.title}` : `Review reminder: ${r.title}`,
    `Dear ${r.reviewerName || "colleague"},\n\n${
      overdue
        ? `Your review of “${r.title}” was due on ${due}.`
        : `A gentle reminder that your review of “${r.title}” is due on ${due}.`
    } If you need more time, simply reply to this email and let the editors know.\n\nOpen the manuscript and review form:\n${siteUrl}/admin/reviews/${r.assignmentId}${SIGN_OFF}`,
    // One reminder per review per day at most, even if the cron runs twice.
    `review-reminder:${r.assignmentId}:${r.today}`,
    serverEnv().EDITORIAL_EMAIL,
  );
}

/** Daily cron: the author's revision is overdue (item 54). At most weekly (the query) and daily (the key). */
export async function notifyRevisionReminder(s: {
  submissionId: string;
  authorEmail: string;
  authorName: string;
  title: string;
  dueDate: string;
  today: string;
}) {
  await toAuthor(
    s.authorEmail,
    revisionReminderEmail({ ...s, link: submissionLink(s.submissionId) }),
    `revision-reminder:${s.submissionId}:${s.today}`,
  );
}

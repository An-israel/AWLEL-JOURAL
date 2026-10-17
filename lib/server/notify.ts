import "server-only";
import { serverEnv } from "@/lib/env.server";
import { siteUrl } from "@/lib/env.public";
import {
  STATUS_HELP,
  STATUS_LABELS,
  RECOMMENDATION_LABELS,
  type Recommendation,
  type SubmissionStatus,
} from "@/lib/submission-status";
import { enqueueJob, runJobNow } from "./jobs";
import { logger } from "./logger";

/*
 * Workflow emails (section 7). Each is queued with an idempotency key (so a
 * retried request never sends twice) and attempted at once; failures stay
 * queued for the worker. Reviewer emails never name the author, and author
 * emails never name the reviewer (blinding).
 */

const SIGN_OFF = "\n\n— The editors, African, World Literature and English Language (AWLEL)";

async function send(to: string, subject: string, text: string, key: string, replyTo?: string) {
  const jobId = await enqueueJob("email.send", { to, subject, text: text + SIGN_OFF, replyTo }, key);
  if (jobId) await runJobNow(jobId).catch((err: unknown) => logger.warn({ err, key }, "email deferred"));
}

export async function notifySubmissionReceived(s: {
  id: string;
  title: string;
  authorEmail: string;
  authorName: string;
}) {
  const link = `${siteUrl}/account/submissions/${s.id}`;
  await Promise.all([
    send(
      s.authorEmail,
      `Manuscript received: ${s.title}`,
      `Dear ${s.authorName || "author"},\n\nThank you for submitting “${s.title}” to AWLEL. We have received your manuscript and will let you know as it moves through screening and review.\n\nYou can follow its progress at any time:\n${link}`,
      `submission-received:${s.id}`,
    ),
    send(
      serverEnv().EDITORIAL_EMAIL,
      `[AWLEL] New submission: ${s.title}`,
      `A new manuscript has been submitted.\n\nTitle: ${s.title}\n\nOpen it in the editorial dashboard:\n${siteUrl}/admin/submissions/${s.id}`,
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
}) {
  const note = s.message ? `\n\nMessage from the editors:\n${s.message}` : "";
  await send(
    s.authorEmail,
    `Your submission is now: ${STATUS_LABELS[s.status]}`,
    `Dear ${s.authorName || "author"},\n\nThe status of “${s.title}” has changed to: ${STATUS_LABELS[s.status]}.\n${STATUS_HELP[s.status]}${note}\n\nDetails and history:\n${siteUrl}/account/submissions/${s.id}`,
    `status:${s.eventKey}`,
    serverEnv().EDITORIAL_EMAIL,
  );
}

export async function notifyReviewerAssigned(r: {
  assignmentId: string;
  reviewerEmail: string;
  reviewerName: string;
  title: string;
  dueDate: string | null;
}) {
  const due = r.dueDate
    ? `\n\nWe would be grateful for your review by ${new Date(r.dueDate).toLocaleDateString("en-GB", { dateStyle: "long" })}.`
    : "";
  await send(
    r.reviewerEmail,
    `Review invitation: ${r.title}`,
    `Dear ${r.reviewerName || "colleague"},\n\nThe editors of AWLEL invite you to review the manuscript “${r.title}”. Review is double-blind: the author's identity is not shared with you, and yours is not shared with the author.${due}\n\nOpen the manuscript and review form:\n${siteUrl}/admin/reviews/${r.assignmentId}`,
    `review-assigned:${r.assignmentId}`,
    serverEnv().EDITORIAL_EMAIL,
  );
}

export async function notifyReviewSubmitted(r: {
  assignmentId: string;
  submissionId: string;
  title: string;
  recommendation: Recommendation;
}) {
  await send(
    serverEnv().EDITORIAL_EMAIL,
    `[AWLEL] Review received: ${r.title}`,
    `A reviewer has submitted their review of “${r.title}”.\n\nRecommendation: ${RECOMMENDATION_LABELS[r.recommendation]}\n\nRead it in the editorial dashboard:\n${siteUrl}/admin/submissions/${r.submissionId}`,
    `review-submitted:${r.assignmentId}`,
  );
}

export async function notifyRevisionUploaded(s: { id: string; title: string; fileId: string }) {
  await send(
    serverEnv().EDITORIAL_EMAIL,
    `[AWLEL] Revised manuscript: ${s.title}`,
    `The author has uploaded a revised manuscript for “${s.title}”.\n\nOpen the submission:\n${siteUrl}/admin/submissions/${s.id}`,
    `revision:${s.fileId}`,
  );
}

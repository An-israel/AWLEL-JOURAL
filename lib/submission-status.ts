// Submission statuses (section 7), shared by author, editor and reviewer screens.

export const SUBMISSION_STATUSES = [
  "submitted",
  "under_screening",
  "under_review",
  "revisions_requested",
  "revision_received",
  "accepted",
  "rejected",
  "published",
  "withdrawn",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: "Submitted",
  under_screening: "Under screening",
  under_review: "Under review",
  revisions_requested: "Revisions requested",
  revision_received: "Revision received",
  accepted: "Accepted",
  rejected: "Rejected",
  published: "Published",
  withdrawn: "Withdrawn",
};

/** What each status means, in words an author understands. */
export const STATUS_HELP: Record<SubmissionStatus, string> = {
  submitted: "We have received your manuscript.",
  under_screening:
    "The editors are checking that the manuscript fits the journal and follows the guidelines.",
  under_review: "Your manuscript is with peer reviewers.",
  revisions_requested: "The editors have asked for changes. Upload a revised file when it's ready.",
  revision_received: "Revision received — with the editors. We'll let you know what happens next.",
  accepted: "Your manuscript has been accepted for publication.",
  rejected: "The editors have decided not to publish this manuscript.",
  published: "Your article has been published.",
  withdrawn: "This manuscript has been withdrawn and is no longer being considered.",
};

export const STATUS_BADGE: Record<SubmissionStatus, "default" | "gold" | "coral" | "green" | "muted"> = {
  submitted: "default",
  under_screening: "default",
  under_review: "gold",
  revisions_requested: "coral",
  revision_received: "gold",
  accepted: "green",
  rejected: "muted",
  published: "green",
  withdrawn: "muted",
};

/**
 * The moves an editor may make from each status (item 56). The database
 * enforces the same table (submission_transition_allowed); keep them in step.
 * Withdrawn and published are final. A rejected manuscript can only be
 * reopened for review, with a message explaining why.
 */
export const NEXT_STATUSES: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  submitted: ["under_screening", "under_review", "rejected", "withdrawn"],
  under_screening: ["under_review", "revisions_requested", "rejected", "withdrawn"],
  under_review: ["revisions_requested", "accepted", "rejected", "withdrawn"],
  revisions_requested: ["revision_received", "under_review", "rejected", "withdrawn"],
  revision_received: ["under_review", "revisions_requested", "accepted", "rejected", "withdrawn"],
  accepted: ["published", "withdrawn"],
  rejected: ["under_review"],
  published: [],
  withdrawn: [],
};

/** A decision: outstanding reviews are closed when a submission reaches one of these. */
export const CLOSED_STATUSES: readonly SubmissionStatus[] = [
  "accepted",
  "rejected",
  "published",
  "withdrawn",
];

/** Statuses an author may still withdraw from online. */
export const WITHDRAWABLE_STATUSES: readonly SubmissionStatus[] = [
  "submitted",
  "under_screening",
  "under_review",
  "revisions_requested",
  "revision_received",
];

export function canMoveTo(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

export const RECOMMENDATIONS = ["accept", "minor_revisions", "major_revisions", "reject"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  accept: "Accept",
  minor_revisions: "Minor revisions",
  major_revisions: "Major revisions",
  reject: "Reject",
};

/**
 * What a submission file is, by its role rather than its kind (item 64). The
 * optional PDF copy is stored as an "original" too, so it is told apart by type.
 */
export function fileRoleLabel(file: {
  kind: "original" | "revision" | "reviewer_annotated";
  version: number;
  isPdf: boolean;
}): string {
  if (file.kind === "reviewer_annotated") return "Reviewer's marked-up file";
  if (file.kind === "revision") return `Revised manuscript v${file.version}`;
  return file.isPdf ? "PDF copy" : "Word manuscript";
}

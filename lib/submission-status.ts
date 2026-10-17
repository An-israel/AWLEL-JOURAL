// Submission statuses (section 7), shared by author, editor and reviewer screens.

export const SUBMISSION_STATUSES = [
  "submitted",
  "under_screening",
  "under_review",
  "revisions_requested",
  "accepted",
  "rejected",
  "published",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: "Submitted",
  under_screening: "Under screening",
  under_review: "Under review",
  revisions_requested: "Revisions requested",
  accepted: "Accepted",
  rejected: "Rejected",
  published: "Published",
};

/** What each status means, in words an author understands. */
export const STATUS_HELP: Record<SubmissionStatus, string> = {
  submitted: "We have received your manuscript.",
  under_screening:
    "The editors are checking that the manuscript fits the journal and follows the guidelines.",
  under_review: "Your manuscript is with peer reviewers.",
  revisions_requested: "The editors have asked for changes. Upload a revised file when it's ready.",
  accepted: "Your manuscript has been accepted for publication.",
  rejected: "The editors have decided not to publish this manuscript.",
  published: "Your article has been published.",
};

export const STATUS_BADGE: Record<SubmissionStatus, "default" | "gold" | "coral" | "green" | "muted"> = {
  submitted: "default",
  under_screening: "default",
  under_review: "gold",
  revisions_requested: "coral",
  accepted: "green",
  rejected: "muted",
  published: "green",
};

export const RECOMMENDATIONS = ["accept", "minor_revisions", "major_revisions", "reject"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  accept: "Accept",
  minor_revisions: "Minor revisions",
  major_revisions: "Major revisions",
  reject: "Reject",
};

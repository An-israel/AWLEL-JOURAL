import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE, STATUS_LABELS, type SubmissionStatus } from "@/lib/submission-status";

/**
 * The submission's status, or "Not finished" when the author never completed
 * it (no Word manuscript, never finalised; item 51).
 */
export function StatusBadge({
  status,
  unfinished = false,
}: {
  status: SubmissionStatus;
  unfinished?: boolean;
}) {
  if (unfinished) return <Badge variant="coral">Not finished</Badge>;
  return <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** Derived, not a status: details saved, but never finalised with a manuscript. */
export function isUnfinished(s: { status: SubmissionStatus; finalised_at: string | null }): boolean {
  return s.status === "submitted" && !s.finalised_at;
}

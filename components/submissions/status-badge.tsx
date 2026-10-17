import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE, STATUS_LABELS, type SubmissionStatus } from "@/lib/submission-status";

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>;
}

import { STATUS_LABELS, type SubmissionStatus } from "@/lib/submission-status";

export interface TimelineEvent {
  id: string;
  createdAt: string;
  fromStatus: SubmissionStatus | null;
  toStatus: SubmissionStatus;
  message: string | null;
  actor?: string | null;
  internal?: boolean;
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** Status history, newest first. Messages are plain text, never HTML. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-6 border-l-2 border-line pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-white bg-gold ring-2 ring-gold-light"
          />
          <p className="text-sm font-semibold text-ink">
            {e.fromStatus === e.toStatus ? "Note" : e.fromStatus ? STATUS_LABELS[e.toStatus] : "Submitted"}
            {e.internal ? (
              <span className="ml-2 text-xs font-normal text-ink-muted">(editors only)</span>
            ) : null}
          </p>
          <p className="text-xs text-ink-muted">
            <time dateTime={e.createdAt}>{when.format(new Date(e.createdAt))}</time>
            {e.actor ? ` · ${e.actor}` : ""}
          </p>
          {e.message ? (
            <p className="mt-2 rounded-md bg-paper px-3 py-2 text-sm whitespace-pre-wrap">{e.message}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

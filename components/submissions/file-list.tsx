"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { submissionFileUrl } from "@/lib/submissions/files";

export interface SubmissionFileRow {
  id: string;
  label: string;
  meta: string;
}

/** Download links for submission files; each opens a short-lived signed URL. */
export function SubmissionFileList({
  files,
  empty = "No files yet.",
}: {
  files: SubmissionFileRow[];
  empty?: string;
}) {
  const [pending, start] = useTransition();
  if (files.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-medium break-all text-ink">{f.label}</span>{" "}
            <span className="text-ink-muted">· {f.meta}</span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await submissionFileUrl(f.id);
                if (r.ok && r.data) window.location.assign(r.data.url);
                else if (!r.ok) toast.error(r.message);
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-navy hover:border-navy"
          >
            <Download aria-hidden className="size-3.5" /> Download
          </button>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { uploadSubmissionFile } from "@/lib/submissions/upload-client";
import { recordRevision } from "../actions";

export function RevisionUpload({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <form
      className="space-y-3 rounded-lg border border-coral/40 bg-[#FDECEF]/40 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return void toast.error("Choose your revised manuscript first.");
        setProgress(0);
        const r = await uploadSubmissionFile(submissionId, "revision", file, setProgress);
        if (!r.ok || !r.data) {
          setProgress(null);
          return void toast.error(r.ok ? "Upload failed." : r.message);
        }
        const done = await recordRevision({ submissionId, fileId: r.data.id });
        setProgress(null);
        if (!done.ok) return void toast.error(done.message);
        toast.success(done.message ?? "Sent");
        setFile(null);
        router.refresh();
      }}
    >
      <h2 className="text-lg font-semibold">Upload your revised manuscript</h2>
      <p className="text-sm text-ink-muted">
        Word (.docx) or PDF, up to 20 MB. Remove your name from the file and its properties.
      </p>
      <input
        type="file"
        accept=".docx,.pdf"
        aria-label="Revised manuscript"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-white"
      />
      {progress !== null ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-royal" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <Button type="submit" disabled={progress !== null}>
        {progress !== null ? "Uploading…" : "Send revised manuscript"}
      </Button>
    </form>
  );
}

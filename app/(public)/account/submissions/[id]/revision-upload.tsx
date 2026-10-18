"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { longDate } from "@/lib/submissions/emails";
import { uploadSubmissionFile } from "@/lib/submissions/upload-client";
import { recordRevision } from "../actions";

/**
 * The revised manuscript and the author's response to the reviewers
 * (item 52). Once recorded, the submission is "Revision received" and this
 * box disappears. A file that uploaded but whose response failed to save is
 * not uploaded again on retry.
 */
export function RevisionUpload({ submissionId, dueDate }: { submissionId: string; dueDate: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const uploaded = useRef(new Map<string, string>());

  return (
    <form
      className="space-y-4 rounded-lg border border-coral/40 bg-[#FDECEF]/40 p-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const problems: Record<string, string> = {};
        if (!file) problems.file = "Choose your revised manuscript.";
        if (response.trim().length < 20)
          problems.response =
            "Please tell the editors and reviewers what you changed (a few sentences at least).";
        setErrors(problems);
        if (!file || Object.keys(problems).length) return;

        const key = `${file.name}:${file.size}:${file.lastModified}`;
        let fileId = uploaded.current.get(key);
        if (!fileId) {
          setProgress(0);
          const r = await uploadSubmissionFile(submissionId, "revision", file, setProgress);
          if (!r.ok || !r.data) {
            setProgress(null);
            setErrors({ file: r.ok ? "Upload failed." : r.message });
            return;
          }
          fileId = r.data.id;
          uploaded.current.set(key, fileId);
        }
        const done = await recordRevision({ submissionId, fileId, response });
        setProgress(null);
        if (!done.ok) {
          setErrors(done.fieldErrors ?? {});
          return void toast.error(done.message);
        }
        toast.success(done.message ?? "Sent");
        router.refresh();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Send your revised manuscript</h2>
        {dueDate ? (
          <p className="mt-1 text-sm font-medium text-coral-ink">Please send it by {longDate(dueDate)}.</p>
        ) : null}
        <p className="mt-1 text-sm text-ink-muted">
          Word (.docx) or PDF, up to 20 MB. We remove your name from a Word file&rsquo;s properties when it
          uploads; please also remove it from the text.
        </p>
      </div>
      <div>
        <Label htmlFor="rv-file">Revised manuscript</Label>
        <input
          id="rv-file"
          type="file"
          accept=".docx,.pdf"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={errors.file ? "rv-file-error" : undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-white"
        />
        <FieldError id="rv-file-error">{errors.file}</FieldError>
      </div>
      <div>
        <Label htmlFor="rv-response">Response to the reviewers</Label>
        <Textarea
          id="rv-response"
          rows={7}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          className="mt-1.5"
          aria-invalid={errors.response ? true : undefined}
          aria-describedby={`rv-response-hint${errors.response ? " rv-response-error" : ""}`}
        />
        <p id="rv-response-hint" className="mt-1 text-xs text-ink-muted">
          Go through the comments point by point: what you changed and where, or why you didn&rsquo;t. The
          editors and reviewers read this; don&rsquo;t include your name.
        </p>
        <FieldError id="rv-response-error">{errors.response}</FieldError>
      </div>
      {progress !== null ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Upload progress"
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

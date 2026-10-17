"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { RECOMMENDATION_LABELS, RECOMMENDATIONS, type Recommendation } from "@/lib/submission-status";
import { uploadSubmissionFile } from "@/lib/submissions/upload-client";
import { saveReview } from "../actions";

export function ReviewForm({
  assignmentId,
  submissionId,
  version: initialVersion,
  comments: initialComments,
  recommendation: initialRecommendation,
  annotatedFileId: initialAnnotated,
  annotatedFileName,
}: {
  assignmentId: string;
  submissionId: string;
  version: number;
  comments: string;
  recommendation: Recommendation | null;
  annotatedFileId: string | null;
  annotatedFileName: string | null;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(initialVersion);
  const [comments, setComments] = useState(initialComments);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(initialRecommendation);
  const [annotated, setAnnotated] = useState<{ id: string; name: string } | null>(
    initialAnnotated ? { id: initialAnnotated, name: annotatedFileName ?? "Annotated file" } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty);

  function save(submit: boolean) {
    start(async () => {
      const r = await saveReview({
        assignmentId,
        expectedVersion: version,
        comments,
        recommendation,
        annotatedFileId: annotated?.id ?? null,
        submit,
      });
      setConfirming(false);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        if (r.conflict) setConflict(true);
        return void toast.error(r.message);
      }
      setErrors({});
      setDirty(false);
      if (r.data) setVersion(r.data.version);
      toast.success(r.message ?? "Saved");
      if (submit) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ConflictBanner show={conflict} />
      <fieldset aria-describedby={errors.recommendation ? "rec-error" : undefined}>
        <legend className="text-base font-semibold">Recommendation</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {RECOMMENDATIONS.map((r) => (
            <label
              key={r}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${recommendation === r ? "border-navy bg-[#E8EDFA]" : "border-line bg-white"}`}
            >
              <input
                type="radio"
                name="recommendation"
                checked={recommendation === r}
                onChange={() => {
                  setRecommendation(r);
                  setDirty(true);
                }}
              />
              {RECOMMENDATION_LABELS[r]}
            </label>
          ))}
        </div>
        <FieldError id="rec-error">{errors.recommendation}</FieldError>
      </fieldset>

      <div>
        <p id="rc-label" className="text-base font-semibold">
          Comments for the editors and author
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Your comments may be shared with the author without your name. Please don&rsquo;t identify yourself.
        </p>
        <div className="mt-2">
          <RichTextEditor
            id="rc-comments"
            labelledBy="rc-label"
            value={comments}
            onChange={(v) => {
              setComments(v);
              setDirty(true);
            }}
            minHeight="16rem"
            invalid={Boolean(errors.comments)}
          />
        </div>
        <FieldError id="rc-error">{errors.comments}</FieldError>
      </div>

      <div>
        <p className="text-base font-semibold">Annotated manuscript (optional)</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Word or PDF, up to 20 MB. Remove your name from the file&rsquo;s properties first.
        </p>
        {annotated ? (
          <p className="mt-2 text-sm">
            Attached: <strong className="break-all">{annotated.name}</strong>
          </p>
        ) : null}
        <input
          type="file"
          accept=".docx,.pdf"
          aria-label="Annotated manuscript"
          disabled={uploading}
          className="mt-2 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-white"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            const r = await uploadSubmissionFile(submissionId, "reviewer_annotated", file);
            setUploading(false);
            if (!r.ok || !r.data) return void toast.error(r.ok ? "Upload failed." : r.message);
            setAnnotated({ id: r.data.id, name: file.name });
            setDirty(true);
            toast.success("File attached. Save or submit your review to keep it.");
          }}
        />
      </div>

      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button variant="outline" disabled={pending || uploading || !dirty} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button disabled={pending || uploading} onClick={() => setConfirming(true)}>
          Submit review
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Submit your review?"
        description="Once submitted, the review goes to the editors and can't be changed."
        confirmLabel="Submit review"
        onConfirm={() => save(true)}
      />
    </div>
  );
}

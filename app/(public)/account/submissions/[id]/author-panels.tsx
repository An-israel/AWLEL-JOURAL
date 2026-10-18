"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { uploadSubmissionFile } from "@/lib/submissions/upload-client";
import { finalizeSubmission } from "../../../submit/actions";
import { updateSubmissionDetails, withdrawSubmission } from "../actions";

/**
 * "Not finished" (item 51): the details were saved but the Word manuscript
 * never arrived. Uploads it to this same submission and finishes it, with
 * the same upload and finishing steps as the submission form.
 */
export function FinishSubmission({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  const uploaded = useRef(new Set<string>());
  return (
    <form
      noValidate
      className="space-y-3 rounded-lg border border-coral/40 bg-[#FDECEF]/40 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return setError("Choose your manuscript as a Word document (.docx).");
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!uploaded.current.has(key)) {
          setProgress(0);
          const r = await uploadSubmissionFile(submissionId, "original", file, setProgress, true);
          if (!r.ok) {
            setProgress(null);
            return setError(r.message);
          }
          uploaded.current.add(key);
        }
        const done = await finalizeSubmission(submissionId);
        setProgress(null);
        if (!done.ok) return setError(done.message);
        setError(undefined);
        toast.success(done.message ?? "Submitted");
        router.refresh();
      }}
    >
      <h2 className="text-lg font-semibold">Not finished — upload your manuscript</h2>
      <p className="text-sm text-ink-muted">
        We saved your details, but your manuscript didn&rsquo;t arrive, so the editors can&rsquo;t see this
        submission yet. Upload it as a Word document (.docx), up to 20 MB, to finish submitting.
      </p>
      <div>
        <Label htmlFor="fin-file">Manuscript (.docx)</Label>
        <input
          id="fin-file"
          type="file"
          accept=".docx"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "fin-file-error" : undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-white"
        />
        <FieldError id="fin-file-error">{error}</FieldError>
      </div>
      {progress !== null ? (
        <p role="status" className="text-xs text-ink-muted">
          Uploading… {Math.round(progress * 100)}%
        </p>
      ) : null}
      <Button type="submit" disabled={progress !== null}>
        {progress !== null ? "Uploading…" : "Upload and submit"}
      </Button>
    </form>
  );
}

/** "Withdraw submission" with a confirmation and an optional reason (item 53). */
export function WithdrawSubmission({
  submissionId,
  unfinished,
}: {
  submissionId: string;
  unfinished: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {unfinished ? "Discard this submission" : "Withdraw submission"}
      </Button>
      <DialogContent>
        <DialogHeader
          title={unfinished ? "Discard this submission?" : "Withdraw this submission?"}
          description="The editors will stop considering it, and you can't undo this. To send the work again later, you'd make a new submission."
        />
        <div>
          <Label htmlFor="wd-reason">Reason (optional)</Label>
          <Textarea
            id="wd-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5"
            placeholder="For example, it has been accepted elsewhere."
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline">Keep it</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await withdrawSubmission({ submissionId, reason });
                if (!r.ok) return void toast.error(r.message);
                setOpen(false);
                toast.success(r.message ?? "Withdrawn");
                router.refresh();
              })
            }
          >
            {pending ? "Withdrawing…" : "Withdraw"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CoAuthor {
  key: number;
  fullName: string;
  affiliation: string;
  email: string;
}

/** "Edit details" while the submission is still "Submitted" (item 53). */
export function EditDetails(props: {
  submissionId: string;
  version: number;
  title: string;
  abstract: string;
  keywords: string[];
  coAuthors: Omit<CoAuthor, "key">[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(props.title);
  const [abstract, setAbstract] = useState(props.abstract);
  const [keywords, setKeywords] = useState(props.keywords.join(", "));
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>(props.coAuthors.map((a, i) => ({ ...a, key: i })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const seq = useRef(props.coAuthors.length);
  const describedBy = (k: string) => (errors[k] ? `ed-${k.replace(/\./g, "-")}-error` : undefined);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit details
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="w-full space-y-4 rounded-lg border border-line bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateSubmissionDetails({
            submissionId: props.submissionId,
            expectedVersion: props.version,
            title,
            abstract,
            keywords: keywords
              .split(/[,;\n]/)
              .map((k) => k.trim())
              .filter(Boolean),
            coAuthors: coAuthors.map(({ fullName, affiliation, email }) => ({
              fullName,
              affiliation,
              email,
            })),
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return void toast.error(r.message);
          }
          setErrors({});
          setOpen(false);
          toast.success(r.message ?? "Saved");
          router.refresh();
        });
      }}
    >
      <h2 className="text-lg font-semibold">Edit details</h2>
      <p className="text-sm text-ink-muted">You can change these until the editors start screening.</p>
      <div>
        <Label htmlFor="ed-title">Title</Label>
        <Input
          id="ed-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1.5"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy("title")}
        />
        <FieldError id="ed-title-error">{errors.title}</FieldError>
      </div>
      <div>
        <Label htmlFor="ed-abstract">Abstract</Label>
        <Textarea
          id="ed-abstract"
          rows={8}
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          className="mt-1.5 font-serif text-base"
          aria-invalid={errors.abstract ? true : undefined}
          aria-describedby={describedBy("abstract")}
        />
        <FieldError id="ed-abstract-error">{errors.abstract}</FieldError>
      </div>
      <div>
        <Label htmlFor="ed-keywords">Keywords</Label>
        <Input
          id="ed-keywords"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="mt-1.5"
          aria-invalid={errors.keywords ? true : undefined}
          aria-describedby={`ed-keywords-hint ${describedBy("keywords") ?? ""}`}
        />
        <p id="ed-keywords-hint" className="mt-1 text-xs text-ink-muted">
          Three to ten, separated by commas.
        </p>
        <FieldError id="ed-keywords-error">{errors.keywords}</FieldError>
      </div>
      {coAuthors.map((a, i) => (
        <fieldset
          key={a.key}
          className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <legend className="px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Co-author {i + 1}
          </legend>
          {(["fullName", "affiliation", "email"] as const).map((field) => {
            const k = `coAuthors.${i}.${field}`;
            return (
              <div key={field}>
                <Label htmlFor={`ed-ca-${a.key}-${field}`} className="text-xs">
                  {field === "fullName"
                    ? "Name"
                    : field === "affiliation"
                      ? "Institution"
                      : "Email (optional)"}
                </Label>
                <Input
                  id={`ed-ca-${a.key}-${field}`}
                  type={field === "email" ? "email" : "text"}
                  value={a[field]}
                  onChange={(e) =>
                    setCoAuthors((list) =>
                      list.map((x) => (x.key === a.key ? { ...x, [field]: e.target.value } : x)),
                    )
                  }
                  className="mt-1 h-9"
                  aria-invalid={errors[k] ? true : undefined}
                  aria-describedby={describedBy(k)}
                />
                <FieldError id={`ed-${k.replace(/\./g, "-")}-error`}>{errors[k]}</FieldError>
              </div>
            );
          })}
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove co-author ${i + 1}`}
              onClick={() => setCoAuthors((l) => l.filter((x) => x.key !== a.key))}
            >
              Remove
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setCoAuthors((l) => [...l, { key: ++seq.current, fullName: "", affiliation: "", email: "" }])
          }
        >
          Add a co-author
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

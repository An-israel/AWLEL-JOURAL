"use client";

import { FileUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { checkSubmissionFile } from "@/lib/submissions/file-rules";
import { uploadSubmissionFile } from "@/lib/submissions/upload-client";
import { createSubmission, finalizeSubmission } from "./actions";
import { submissionSchema, type SubmissionInput } from "./schema";

interface CoAuthor {
  key: number;
  fullName: string;
  affiliation: string;
  email: string;
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s${n}`} className="rounded-lg border border-line bg-white p-6">
      <h2 id={`s${n}`} className="flex items-center gap-3 text-xl">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-navy text-sm text-white"
        >
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function SubmissionForm({
  categories,
  defaultAffiliation,
  authorName,
}: {
  categories: { id: string; name: string }[];
  defaultAffiliation: string;
  authorName: string;
}) {
  const router = useRouter();
  // One key per form: a retry or double click returns the same submission (item 14).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    title: "",
    abstract: "",
    keywords: "",
    categoryId: "",
    citationStyle: "" as "" | "apa7" | "mla8",
    affiliation: defaultAffiliation,
    coverLetter: "",
  });
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);
  const [declarations, setDeclarations] = useState({
    original: false,
    notUnderReview: false,
    followsGuidelines: false,
  });
  const [manuscript, setManuscript] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "saving" | "uploading" | "finishing">("idle");
  const [progress, setProgress] = useState(0);
  const submissionId = useRef<string | null>(null);
  const keySeq = useRef(0);
  const dirty = Boolean(form.title || form.abstract || manuscript);
  useUnsavedChanges(dirty && stage === "idle");

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k: string) => errors[k];
  const describedBy = (k: string) => (errors[k] ? `f-${k}-error` : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const fileErrors: Record<string, string> = {};
    if (!manuscript) fileErrors.manuscript = "Attach your manuscript as a Word document (.docx).";
    else {
      const problem = checkSubmissionFile(manuscript, true);
      if (problem) fileErrors.manuscript = problem;
    }
    if (pdf) {
      const problem = checkSubmissionFile(pdf);
      if (problem || !pdf.name.toLowerCase().endsWith(".pdf"))
        fileErrors.pdf = problem ?? "The optional copy must be a PDF.";
    }

    const input: SubmissionInput = {
      idempotencyKey,
      ...form,
      citationStyle: form.citationStyle as "apa7" | "mla8",
      keywords: form.keywords
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
      coAuthors: coAuthors.map(({ fullName, affiliation, email }) => ({ fullName, affiliation, email })),
      declarations: declarations as { original: true; notUnderReview: true; followsGuidelines: true },
    };
    // Check everything here first (same schema as the server), so nothing is
    // created until the whole form is complete.
    const local = submissionSchema.safeParse(input);
    const localErrors: Record<string, string> = {};
    if (!local.success)
      for (const issue of local.error.issues) localErrors[issue.path.join(".")] ??= issue.message;
    if (!local.success || Object.keys(fileErrors).length) {
      setErrors({ ...localErrors, ...fileErrors });
      setMessage("Please check the highlighted fields.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }

    setStage("saving");
    const created = await createSubmission(input);
    if (!created.ok || !created.data) {
      setStage("idle");
      setErrors(created.ok ? {} : (created.fieldErrors ?? {}));
      setMessage(created.ok ? "Something went wrong. Please try again." : created.message);
      return;
    }
    submissionId.current = created.data.id;

    setStage("uploading");
    for (const [file, label] of [
      [manuscript!, "manuscript"],
      [pdf, "pdf"],
    ] as const) {
      if (!file) continue;
      setProgress(0);
      const r = await uploadSubmissionFile(
        created.data.id,
        "original",
        file,
        setProgress,
        label === "manuscript",
      );
      if (!r.ok) {
        setStage("idle");
        setErrors({ [label]: r.message });
        setMessage(
          "Your details are saved, but a file didn't upload. Press Submit again to retry; nothing will be duplicated.",
        );
        return;
      }
    }

    setStage("finishing");
    const done = await finalizeSubmission(created.data.id);
    if (!done.ok) {
      setStage("idle");
      setMessage(done.message);
      return;
    }
    router.push(`/account/submissions/${created.data.id}?submitted=1`);
  }

  const busy = stage !== "idle";
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {message ? (
        <div role="alert" className="rounded-md bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C]">
          {message}
        </div>
      ) : null}

      <Section n={1} title="Your manuscript">
        <div>
          <Label htmlFor="f-title">Title</Label>
          <Input
            id="f-title"
            value={form.title}
            onChange={set("title")}
            className="mt-1.5"
            aria-invalid={err("title") ? true : undefined}
            aria-describedby={describedBy("title")}
          />
          <FieldError id="f-title-error">{err("title")}</FieldError>
        </div>
        <div>
          <Label htmlFor="f-abstract">Abstract</Label>
          <Textarea
            id="f-abstract"
            rows={8}
            value={form.abstract}
            onChange={set("abstract")}
            className="mt-1.5 font-serif text-base"
            aria-invalid={err("abstract") ? true : undefined}
            aria-describedby={`f-abstract-hint ${describedBy("abstract") ?? ""}`}
          />
          <p id="f-abstract-hint" className="mt-1 text-xs text-ink-muted">
            {form.abstract.trim().split(/\s+/).filter(Boolean).length} words. Separate paragraphs with a blank
            line.
          </p>
          <FieldError id="f-abstract-error">{err("abstract")}</FieldError>
        </div>
        <div>
          <Label htmlFor="f-keywords">Keywords</Label>
          <Input
            id="f-keywords"
            value={form.keywords}
            onChange={set("keywords")}
            placeholder="memory, migration, Nigerian fiction"
            className="mt-1.5"
            aria-invalid={err("keywords") ? true : undefined}
            aria-describedby={`f-keywords-hint ${describedBy("keywords") ?? ""}`}
          />
          <p id="f-keywords-hint" className="mt-1 text-xs text-ink-muted">
            Three to ten, separated by commas.
          </p>
          <FieldError id="f-keywords-error">{err("keywords")}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-category">Subject area</Label>
            <NativeSelect
              id="f-category"
              value={form.categoryId}
              onChange={set("categoryId")}
              className="mt-1.5"
              aria-invalid={err("categoryId") ? true : undefined}
              aria-describedby={describedBy("categoryId")}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError id="f-categoryId-error">{err("categoryId")}</FieldError>
          </div>
          <fieldset aria-describedby={describedBy("citationStyle")}>
            <legend className="text-sm font-medium">Citation style used</legend>
            <div className="mt-2.5 space-y-1.5 text-sm">
              {(
                [
                  ["mla8", "MLA 8th edition (Works Cited)"],
                  ["apa7", "APA 7th edition (References)"],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="citationStyle"
                    value={v}
                    checked={form.citationStyle === v}
                    onChange={set("citationStyle")}
                  />{" "}
                  {l}
                </label>
              ))}
            </div>
            <FieldError id="f-citationStyle-error">{err("citationStyle")}</FieldError>
          </fieldset>
        </div>
      </Section>

      <Section n={2} title="Authors">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-you">You (corresponding author)</Label>
            <Input id="f-you" value={authorName} disabled readOnly className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="f-affiliation">Your institution</Label>
            <Input
              id="f-affiliation"
              value={form.affiliation}
              onChange={set("affiliation")}
              className="mt-1.5"
              aria-invalid={err("affiliation") ? true : undefined}
              aria-describedby={describedBy("affiliation")}
            />
            <FieldError id="f-affiliation-error">{err("affiliation")}</FieldError>
          </div>
        </div>
        {coAuthors.map((a, i) => (
          <fieldset
            key={a.key}
            className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <legend className="px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              Co-author {i + 1}
            </legend>
            {(["fullName", "affiliation", "email"] as const).map((field) => (
              <div key={field}>
                <Label htmlFor={`ca-${a.key}-${field}`} className="text-xs">
                  {field === "fullName"
                    ? "Name"
                    : field === "affiliation"
                      ? "Institution"
                      : "Email (optional)"}
                </Label>
                <Input
                  id={`ca-${a.key}-${field}`}
                  type={field === "email" ? "email" : "text"}
                  value={a[field]}
                  onChange={(e) =>
                    setCoAuthors((list) =>
                      list.map((x) => (x.key === a.key ? { ...x, [field]: e.target.value } : x)),
                    )
                  }
                  className="mt-1 h-9"
                  aria-invalid={err(`coAuthors.${i}.${field}`) ? true : undefined}
                />
                <FieldError id={`ca-${a.key}-${field}-error`}>{err(`coAuthors.${i}.${field}`)}</FieldError>
              </div>
            ))}
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Remove co-author ${i + 1}`}
                onClick={() => setCoAuthors((l) => l.filter((x) => x.key !== a.key))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setCoAuthors((l) => [...l, { key: ++keySeq.current, fullName: "", affiliation: "", email: "" }])
          }
        >
          <Plus aria-hidden /> Add a co-author
        </Button>
      </Section>

      <Section n={3} title="Files">
        <p className="text-sm text-ink-muted">
          Upload the manuscript as a Word document (.docx), up to 20 MB, prepared as described in the{" "}
          <Link href="/submission-guidelines">submission guidelines</Link>. For double-blind review, remove
          your name from the manuscript and the file&rsquo;s properties.
        </p>
        <FileInput
          id="f-manuscript"
          label="Manuscript (.docx, required)"
          accept=".docx"
          file={manuscript}
          onChange={setManuscript}
          error={err("manuscript")}
        />
        <FileInput
          id="f-pdf"
          label="PDF copy (optional)"
          accept=".pdf"
          file={pdf}
          onChange={setPdf}
          error={err("pdf")}
        />
        {stage === "uploading" ? (
          <div role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-royal" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">Uploading… {Math.round(progress * 100)}%</p>
          </div>
        ) : null}
      </Section>

      <Section n={4} title="Cover letter (optional)">
        <Textarea
          id="f-cover"
          aria-label="Cover letter"
          rows={6}
          value={form.coverLetter}
          onChange={set("coverLetter")}
          placeholder="Anything the editors should know: the article's contribution, related publications, suggested reviewers to avoid…"
        />
      </Section>

      <Section n={5} title="Declarations">
        {(
          [
            ["original", "This manuscript is my (our) original work."],
            ["notUnderReview", "It is not published or under review elsewhere."],
            [
              "followsGuidelines",
              "It follows the AWLEL submission guidelines, including one citation style throughout.",
            ],
          ] as const
        ).map(([key, text]) => (
          <div key={key}>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={declarations[key]}
                onChange={(e) => setDeclarations((d) => ({ ...d, [key]: e.target.checked }))}
                aria-invalid={err(`declarations.${key}`) ? true : undefined}
                aria-describedby={describedBy(`declarations.${key}`)}
              />
              {text}
            </label>
            <FieldError id={`f-declarations.${key}-error`}>{err(`declarations.${key}`)}</FieldError>
          </div>
        ))}
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={busy}>
          {stage === "saving"
            ? "Saving…"
            : stage === "uploading"
              ? "Uploading…"
              : stage === "finishing"
                ? "Finishing…"
                : "Submit manuscript"}
        </Button>
        <p className="text-sm text-ink-muted">
          You&rsquo;ll get an email confirmation and can follow progress from your account.
        </p>
      </div>
    </form>
  );
}

function FileInput({
  id,
  label,
  accept,
  file,
  onChange,
  error,
}: {
  id: string;
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className={`mt-1.5 flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-4 text-sm ${error ? "border-coral-ink" : "border-line hover:border-navy"}`}
      >
        <FileUp aria-hidden className="size-5 text-ink-muted" />
        <span className={file ? "font-medium text-ink" : "text-ink-muted"}>
          {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "Choose a file…"}
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

"use client";

import { ExternalLink, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { savePage } from "../actions";

export interface PageEditorData {
  slug: string;
  version: number;
  title: string;
  metaDescription: string;
  content: string;
  needsReview: boolean;
}

export interface PageRevision {
  id: string;
  title: string;
  content: string;
  metaDescription: string;
  savedAt: string;
  savedBy: string | null;
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function PageEditor({ page, revisions }: { page: PageEditorData; revisions: PageRevision[] }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState<PageRevision | null>(null);
  const [version, setVersion] = useState(page.version);
  const [form, setForm] = useState(page);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty);
  const set = <K extends keyof PageEditorData>(k: K, v: PageEditorData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const placeholders = (form.content.match(/<mark>/g) ?? []).length;

  return (
    <div className="mt-6 space-y-6">
      <ConflictBanner show={conflict} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="p-title">Page title</Label>
          <Input
            id="p-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="mt-1.5"
            aria-describedby="p-title-error"
          />
          <FieldError id="p-title-error">{errors.title}</FieldError>
        </div>
        <div>
          <Label htmlFor="p-meta">Search engine description</Label>
          <Textarea
            id="p-meta"
            rows={2}
            value={form.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
            className="mt-1.5"
            aria-describedby="p-meta-hint p-meta-error"
          />
          <p id="p-meta-hint" className="mt-1 text-xs text-ink-muted">
            {form.metaDescription.length}/300 characters
          </p>
          <FieldError id="p-meta-error">{errors.metaDescription}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <p id="p-content-label" className="text-sm font-medium">
            Content
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Use the highlighter to mark text that still needs replacing; it shows in yellow on the site.
          </p>
          <div className="mt-2">
            <RichTextEditor
              id="p-content"
              labelledBy="p-content-label"
              value={form.content}
              onChange={(v) => set("content", v)}
              minHeight="28rem"
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Live preview</p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Preview"
            className="mt-2 max-h-[40rem] overflow-y-auto rounded-md border border-line bg-paper p-6"
          >
            <h2 className="text-3xl">{form.title}</h2>
            <hr className="rule-gold mt-4 mb-6 w-16" />
            {/* Preview of the editor's own schema-limited output; the server sanitises on save and on render. */}
            <div className="prose-reading" dangerouslySetInnerHTML={{ __html: form.content }} />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <Button
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = await savePage({ ...form, expectedVersion: version });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                if (r.conflict) setConflict(true);
                return void toast.error(r.message);
              }
              if (r.data) setVersion(r.data.version);
              setErrors({});
              setDirty(false);
              toast.success(r.message ?? "Saved");
              // Shows the new version in the History panel.
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save and publish"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.needsReview}
            onChange={(e) => set("needsReview", e.target.checked)}
          />
          Still contains placeholder text
        </label>
        {placeholders > 0 ? (
          <span className="text-sm text-[#7A4F18]">
            {placeholders} highlighted placeholder{placeholders === 1 ? "" : "s"} left
          </span>
        ) : null}
        <a
          href={`/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-sm font-semibold"
        >
          View on site <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>

      <section aria-labelledby="history-title" className="rounded-lg border border-line bg-white p-5">
        <h2 id="history-title" className="flex items-center gap-2 text-lg font-semibold">
          <History aria-hidden className="size-5" /> History
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Every save is kept. Restoring a version puts it in the editor above; nothing changes on the site
          until you press Save and publish.
        </p>
        {revisions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            No earlier versions yet. They appear after the first save.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-line rounded-md border border-line">
            {revisions.map((r, i) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <time dateTime={r.savedAt} className="font-medium text-ink">
                    {when.format(new Date(r.savedAt))}
                  </time>{" "}
                  <span className="text-ink-muted">
                    {r.savedBy ? `by ${r.savedBy}` : ""}
                    {i === 0 ? " · current version" : ""} · {r.title}
                  </span>
                </span>
                {i > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setRestoring(r)}>
                    Restore this version
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title="Restore this version?"
        description={
          dirty
            ? "Its title and text replace what is in the editor now, including your unsaved changes. The site doesn't change until you press Save and publish."
            : "Its title and text go into the editor. The site doesn't change until you press Save and publish."
        }
        confirmLabel="Restore into the editor"
        onConfirm={() => {
          if (!restoring) return;
          setForm((f) => ({
            ...f,
            title: restoring.title,
            content: restoring.content,
            metaDescription: restoring.metaDescription,
          }));
          setDirty(true);
          setRestoring(null);
          toast.success("Version restored into the editor. Press Save and publish to put it live.");
        }}
      />
    </div>
  );
}

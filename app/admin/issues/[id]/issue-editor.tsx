"use client";

import { ExternalLink, Eye, FilePlus2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { FileSlot } from "@/components/admin/file-slot";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { SortableList } from "@/components/admin/sortable-list";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { AttachedFile } from "@/lib/admin/uploads";
import { MONTHS } from "@/lib/issue-label";
import { reorderIssueArticles, saveIssue, setIssueDeleted, setIssueStatus } from "../actions";

export interface IssueEditorData {
  id: string;
  version: number;
  label: string;
  publicPath: string;
  status: "draft" | "published";
  deleted: boolean;
  issueNumber: number;
  month: number | null;
  legacyNumber: number | null;
  title: string;
  editorial: string;
  coverAlt: string;
  publishedAt: string;
  files: {
    issue_cover: AttachedFile | null;
    issue_pdf: AttachedFile | null;
    issue_docx: AttachedFile | null;
  };
  articles: { id: string; title: string; status: "draft" | "published"; pages: string }[];
}

export function IssueEditor({ issue }: { issue: IssueEditorData }) {
  const router = useRouter();
  const [version, setVersion] = useState(issue.version);
  const [form, setForm] = useState({
    issueNumber: String(issue.issueNumber),
    month: issue.month ? String(issue.month) : "",
    legacyNumber: issue.legacyNumber ? String(issue.legacyNumber) : "",
    title: issue.title,
    editorial: issue.editorial,
    coverAlt: issue.coverAlt,
    publishedAt: issue.publishedAt,
  });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [articles, setArticles] = useState(issue.articles);
  const [orderDirty, setOrderDirty] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | "trash" | null>(null);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty || orderDirty);

  const drafts = articles.filter((a) => a.status === "draft").length;
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  function save() {
    start(async () => {
      const r = await saveIssue({ id: issue.id, expectedVersion: version, ...form });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        if (r.conflict) setConflict(true);
        return void toast.error(r.message);
      }
      setErrors({});
      setDirty(false);
      if (r.data) setVersion(r.data.version);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });
  }

  function runStatus(kind: "publish" | "unpublish" | "trash" | "restore") {
    start(async () => {
      const r =
        kind === "trash" || kind === "restore"
          ? await setIssueDeleted({ id: issue.id, expectedVersion: version, deleted: kind === "trash" })
          : await setIssueStatus({
              id: issue.id,
              expectedVersion: version,
              status: kind === "publish" ? "published" : "draft",
              includeArticles: includeDrafts,
            });
      setConfirm(null);
      if (!r.ok) {
        if (r.conflict) setConflict(true);
        return void toast.error(r.message);
      }
      if (r.data) setVersion(r.data.version);
      toast.success(r.message ?? "Done");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-8">
      <ConflictBanner show={conflict} />

      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white p-5"
        aria-label="Status"
      >
        <div className="flex items-center gap-3">
          {issue.deleted ? (
            <Badge variant="muted">In trash</Badge>
          ) : issue.status === "published" ? (
            <Badge variant="green">Published</Badge>
          ) : (
            <Badge variant="gold">Draft</Badge>
          )}
          <span className="text-sm text-ink-muted">
            {articles.length} articles{drafts ? `, ${drafts} still draft` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link href={`/admin/issues/${issue.id}/preview`}>
              <Eye aria-hidden /> Preview
            </Link>
          </Button>
          {issue.status === "published" && !issue.deleted ? (
            <Button variant="ghost" asChild>
              <a href={issue.publicPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> View on site
              </a>
            </Button>
          ) : null}
          {issue.deleted ? (
            <Button variant="outline" disabled={pending} onClick={() => runStatus("restore")}>
              Restore
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirm("trash")}>
                Move to trash
              </Button>
              {issue.status === "published" ? (
                <Button variant="outline" disabled={pending} onClick={() => setConfirm("unpublish")}>
                  Unpublish
                </Button>
              ) : (
                <Button
                  disabled={pending || dirty}
                  title={dirty ? "Save your changes first" : undefined}
                  onClick={() => setConfirm("publish")}
                >
                  Publish issue
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="details-title" className="rounded-lg border border-line bg-white p-5">
        <h2 id="details-title" className="text-lg font-semibold">
          Details
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="f-issue">Issue number</Label>
            <Input
              id="f-issue"
              type="number"
              min={1}
              value={form.issueNumber}
              onChange={(e) => set("issueNumber")(e.target.value)}
              className="mt-1.5"
              aria-describedby="f-issue-error"
              aria-invalid={errors.issueNumber ? true : undefined}
            />
            <FieldError id="f-issue-error">{errors.issueNumber}</FieldError>
          </div>
          <div>
            <Label htmlFor="f-month">Month (optional)</Label>
            <NativeSelect
              id="f-month"
              value={form.month}
              onChange={(e) => set("month")(e.target.value)}
              className="mt-1.5"
            >
              <option value="">—</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="f-legacy">Legacy number (optional)</Label>
            <Input
              id="f-legacy"
              type="number"
              min={1}
              value={form.legacyNumber}
              onChange={(e) => set("legacyNumber")(e.target.value)}
              className="mt-1.5"
              placeholder="e.g. 19"
            />
          </div>
          <div>
            <Label htmlFor="f-date">Publication date</Label>
            <Input
              id="f-date"
              type="date"
              value={form.publishedAt}
              onChange={(e) => set("publishedAt")(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-title">Title (optional)</Label>
            <Input
              id="f-title"
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              className="mt-1.5"
              placeholder="e.g. Special issue on orature"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-alt">Cover description (for screen readers)</Label>
            <Input
              id="f-alt"
              value={form.coverAlt}
              onChange={(e) => set("coverAlt")(e.target.value)}
              className="mt-1.5"
              placeholder="Cover of AWLEL Volume 25, Issue 1"
            />
          </div>
        </div>
        <div className="mt-5">
          <p id="f-editorial-label" className="text-sm font-medium">
            Editorial or introduction (optional)
          </p>
          <div className="mt-1.5">
            <RichTextEditor
              id="f-editorial"
              labelledBy="f-editorial-label"
              value={form.editorial}
              onChange={set("editorial")}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save details"}
          </Button>
          {dirty ? <span className="text-sm text-ink-muted">Unsaved changes</span> : null}
        </div>
      </section>

      <section aria-labelledby="files-title" className="space-y-3">
        <h2 id="files-title" className="text-lg font-semibold">
          Cover and full-issue files
        </h2>
        <p className="text-sm text-ink-muted">
          Upload the final formatted files. Replacing a file keeps the old one in its history.
        </p>
        <FileSlot
          slot="issue_cover"
          entityId={issue.id}
          version={version}
          onVersion={setVersion}
          current={issue.files.issue_cover}
        />
        <FileSlot
          slot="issue_pdf"
          entityId={issue.id}
          version={version}
          onVersion={setVersion}
          current={issue.files.issue_pdf}
        />
        <FileSlot
          slot="issue_docx"
          entityId={issue.id}
          version={version}
          onVersion={setVersion}
          current={issue.files.issue_docx}
        />
      </section>

      <section aria-labelledby="articles-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="articles-title" className="text-lg font-semibold">
            Articles in this issue
          </h2>
          <div className="flex flex-wrap gap-2">
            {orderDirty ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await reorderIssueArticles({
                      issueId: issue.id,
                      ids: articles.map((a) => a.id),
                    });
                    if (r.ok) {
                      setOrderDirty(false);
                      toast.success(r.message ?? "Saved");
                    } else toast.error(r.message);
                  })
                }
              >
                Save order
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/admin/issues/${issue.id}/bulk`}>
                <Upload aria-hidden /> Bulk upload
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/articles/new?issue=${issue.id}`}>
                <FilePlus2 aria-hidden /> New article
              </Link>
            </Button>
          </div>
        </div>
        {articles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
            No articles yet. Use <strong>Bulk upload</strong> to load a whole issue at once.
          </p>
        ) : (
          <SortableList
            items={articles}
            getId={(a) => a.id}
            getLabel={(a) => a.title}
            disabled={pending}
            onChange={(next) => {
              setArticles(next);
              setOrderDirty(true);
            }}
            render={(a) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/articles/${a.id}`} className="font-medium">
                    {a.title}
                  </Link>
                  {a.pages ? <span className="ml-2 text-xs text-ink-muted">{a.pages}</span> : null}
                </div>
                {a.status === "published" ? (
                  <Badge variant="green">Published</Badge>
                ) : (
                  <Badge variant="gold">Draft</Badge>
                )}
              </div>
            )}
          />
        )}
      </section>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Publish ${issue.label}?`}
        description={
          <span className="block space-y-3">
            <span className="block">
              The issue appears in the archive and on the home page straight away.
            </span>
            {drafts > 0 ? (
              <label className="flex items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={includeDrafts}
                  onChange={(e) => setIncludeDrafts(e.target.checked)}
                />
                Also publish its {drafts} draft {drafts === 1 ? "article" : "articles"}
              </label>
            ) : null}
          </span>
        }
        confirmLabel="Publish"
        onConfirm={() => runStatus("publish")}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Unpublish ${issue.label}?`}
        description="The issue and all its articles disappear from the site until you publish it again. Their links will show “not found”."
        confirmLabel="Unpublish"
        destructive
        onConfirm={() => runStatus("unpublish")}
      />
      <ConfirmDialog
        open={confirm === "trash"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Move this issue to the trash?"
        description="It's unpublished and hidden everywhere. You can restore it from this page."
        confirmLabel="Move to trash"
        destructive
        onConfirm={() => runStatus("trash")}
      />
    </div>
  );
}

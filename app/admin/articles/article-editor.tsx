"use client";

import { ExternalLink, Eye, Plus, Trash2 } from "lucide-react";
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
import { slugify } from "@/lib/admin/slug";
import type { AttachedFile } from "@/lib/admin/uploads";
import { siteUrl } from "@/lib/env.public";
import { saveArticle, setArticleDeleted, setArticleStatus } from "./actions";
import type { AuthorInput } from "./schema";

export interface ArticleEditorData {
  id: string;
  version: number;
  status: "draft" | "published";
  deleted: boolean;
  publicPath: string;
  issuePublished: boolean;
  issueInTrash: boolean;
  issueId: string;
  categoryId: string;
  title: string;
  slug: string;
  abstract: string;
  keywords: string[];
  firstPage: string;
  lastPage: string;
  doi: string;
  citationStyle: "apa7" | "mla8";
  publishedAt: string;
  authors: AuthorInput[];
  files: { article_pdf: AttachedFile | null; article_docx: AttachedFile | null };
}

interface Option {
  id: string;
  label: string;
}

type AuthorRow = AuthorInput & { key: string };

const SITE = siteUrl.replace(/\/$/, "");

let keySeq = 0;
const newKey = () => `a${++keySeq}`;
const emptyAuthor = (): AuthorRow => ({
  key: newKey(),
  fullName: "",
  affiliation: "",
  email: "",
  showEmail: false,
  orcid: "",
  isCorresponding: false,
});

function formFrom(article: ArticleEditorData | null, defaultIssueId?: string) {
  return {
    issueId: article?.issueId ?? defaultIssueId ?? "",
    categoryId: article?.categoryId ?? "",
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    abstract: article?.abstract ?? "",
    keywords: (article?.keywords ?? []).join(", "),
    firstPage: article?.firstPage ?? "",
    lastPage: article?.lastPage ?? "",
    doi: article?.doi ?? "",
    citationStyle: article?.citationStyle ?? ("mla8" as "apa7" | "mla8"),
    publishedAt: article?.publishedAt ?? "",
  };
}

function authorsFrom(article: ArticleEditorData | null): AuthorRow[] {
  return article?.authors.length ? article.authors.map((a) => ({ ...a, key: newKey() })) : [emptyAuthor()];
}

export function ArticleEditor({
  article,
  issues,
  categories,
  defaultIssueId,
}: {
  article: ArticleEditorData | null;
  issues: Option[];
  categories: Option[];
  defaultIssueId?: string;
}) {
  const router = useRouter();
  const isNew = article === null;
  const [version, setVersion] = useState(article?.version ?? 0);
  const [form, setForm] = useState(() => formFrom(article, defaultIssueId));
  const [authors, setAuthors] = useState<AuthorRow[]>(() => authorsFrom(article));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  // After a save, publish or unpublish the page reloads with the server's
  // values (item 68: e.g. the publication date set when publishing). Take
  // them, unless the editor has started typing again: unsaved edits win, and
  // the server never clears the date of a published article anyway.
  const [loadedVersion, setLoadedVersion] = useState(article?.version);
  if (article && article.version !== loadedVersion) {
    setLoadedVersion(article.version);
    if (!dirty) {
      setForm(formFrom(article));
      setAuthors(authorsFrom(article));
      setVersion(article.version);
    }
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<"unpublish" | "trash" | null>(null);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const setAuthor = (key: string, patch: Partial<AuthorInput>) => {
    setAuthors((list) =>
      list.map((a) =>
        a.key === key ? { ...a, ...patch } : patch.isCorresponding ? { ...a, isCorresponding: false } : a,
      ),
    );
    setDirty(true);
  };
  const err = (k: string) => errors[k];

  function save() {
    start(async () => {
      const r = await saveArticle({
        id: article?.id,
        expectedVersion: article ? version : undefined,
        ...form,
        keywords: form.keywords
          .split(/[,;\n]/)
          .map((k) => k.trim())
          .filter(Boolean),
        authors: authors.map((a) => ({
          fullName: a.fullName,
          affiliation: a.affiliation,
          email: a.email,
          showEmail: a.showEmail,
          orcid: a.orcid,
          isCorresponding: a.isCorresponding,
        })),
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        if (r.conflict) setConflict(true);
        return void toast.error(r.message);
      }
      setErrors({});
      setDirty(false);
      toast.success(r.message ?? "Saved");
      if (isNew && r.data) router.push(`/admin/articles/${r.data.id}`);
      else {
        if (r.data) setVersion(r.data.version);
        router.refresh();
      }
    });
  }

  function status(kind: "publish" | "unpublish" | "trash" | "restore") {
    if (!article) return;
    start(async () => {
      const r =
        kind === "trash" || kind === "restore"
          ? await setArticleDeleted({ id: article.id, expectedVersion: version, deleted: kind === "trash" })
          : await setArticleStatus({
              id: article.id,
              expectedVersion: version,
              status: kind === "publish" ? "published" : "draft",
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

      {article ? (
        <section
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white p-5"
          aria-label="Status"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {article.deleted ? (
              <Badge variant="muted">In trash</Badge>
            ) : article.status === "published" && !article.issuePublished ? (
              <Badge variant="gold">Not live</Badge>
            ) : article.status === "published" ? (
              <Badge variant="green">Published</Badge>
            ) : (
              <Badge variant="gold">Draft</Badge>
            )}
            {article.status === "published" && !article.issuePublished && !article.deleted ? (
              <span className="text-ink-muted">
                {article.issueInTrash
                  ? "It's marked as published, but its issue is in the trash, so it isn't on the site."
                  : "It's marked as published, but its issue is still a draft, so it isn't on the site yet."}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button variant="ghost" disabled title="Save your changes first">
                <Eye aria-hidden /> Preview (save your changes first)
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link href={`/admin/articles/${article.id}/preview`}>
                  <Eye aria-hidden /> Preview
                </Link>
              </Button>
            )}
            {article.status === "published" && article.issuePublished && !article.deleted ? (
              <Button variant="ghost" asChild>
                <a href={article.publicPath} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden /> View on site
                </a>
              </Button>
            ) : null}
            {article.deleted ? (
              <Button variant="outline" disabled={pending} onClick={() => status("restore")}>
                Restore
              </Button>
            ) : (
              <>
                <Button variant="ghost" disabled={pending} onClick={() => setConfirm("trash")}>
                  Move to trash
                </Button>
                {article.status === "published" ? (
                  <Button variant="outline" disabled={pending} onClick={() => setConfirm("unpublish")}>
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    disabled={pending || dirty}
                    title={dirty ? "Save your changes first" : undefined}
                    onClick={() => status("publish")}
                  >
                    Publish article
                  </Button>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="meta-title" className="rounded-lg border border-line bg-white p-5">
        <h2 id="meta-title" className="text-lg font-semibold">
          Article details
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="a-issue">Issue</Label>
            <NativeSelect
              id="a-issue"
              value={form.issueId}
              onChange={(e) => set("issueId", e.target.value)}
              className="mt-1.5"
              aria-invalid={err("issueId") ? true : undefined}
              aria-describedby="a-issue-error"
            >
              <option value="">Choose an issue…</option>
              {issues.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </NativeSelect>
            <FieldError id="a-issue-error">{err("issueId")}</FieldError>
          </div>
          <div>
            <Label htmlFor="a-category">Category</Label>
            <NativeSelect
              id="a-category"
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className="mt-1.5"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              value={form.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (!slugTouched) setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
              }}
              className="mt-1.5"
              aria-invalid={err("title") ? true : undefined}
              aria-describedby="a-title-error"
            />
            <FieldError id="a-title-error">{err("title")}</FieldError>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="a-slug">Web address</Label>
            <Input
              id="a-slug"
              value={form.slug}
              onChange={(e) => {
                set("slug", e.target.value);
                setSlugTouched(true);
              }}
              className="mt-1.5 font-mono text-xs"
              aria-invalid={err("slug") ? true : undefined}
              aria-describedby="a-slug-hint a-slug-error"
            />
            <p id="a-slug-hint" className="mt-1 text-xs break-all text-ink-muted">
              The last part of the article&rsquo;s address on the site: {SITE}/articles/
              <strong className="font-semibold text-ink">{form.slug || "…"}</strong>. Use lowercase letters,
              numbers and hyphens.
              {article?.status === "published"
                ? " If you change it, the old address keeps working and redirects here."
                : ""}
            </p>
            <FieldError id="a-slug-error">{err("slug")}</FieldError>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="a-first">First page</Label>
              <Input
                id="a-first"
                type="number"
                min={1}
                value={form.firstPage}
                onChange={(e) => set("firstPage", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="a-last">Last page</Label>
              <Input
                id="a-last"
                type="number"
                min={1}
                value={form.lastPage}
                onChange={(e) => set("lastPage", e.target.value)}
                className="mt-1.5"
                aria-invalid={err("lastPage") ? true : undefined}
                aria-describedby="a-last-error"
              />
              <FieldError id="a-last-error">{err("lastPage")}</FieldError>
            </div>
          </div>
          <div>
            <Label htmlFor="a-date">Publication date</Label>
            <Input
              id="a-date"
              type="date"
              value={form.publishedAt}
              onChange={(e) => set("publishedAt", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="a-doi">DOI (optional)</Label>
            <Input
              id="a-doi"
              value={form.doi}
              onChange={(e) => set("doi", e.target.value)}
              placeholder="10.1234/awlel.2025.01"
              className="mt-1.5"
              aria-invalid={err("doi") ? true : undefined}
              aria-describedby="a-doi-error"
            />
            <FieldError id="a-doi-error">{err("doi")}</FieldError>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Citation style used</legend>
            <div className="mt-2.5 flex gap-5 text-sm">
              {(
                [
                  ["mla8", "MLA 8th (Works Cited)"],
                  ["apa7", "APA 7th (References)"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="citationStyle"
                    checked={form.citationStyle === value}
                    onChange={() => set("citationStyle", value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <Label htmlFor="a-keywords">Keywords</Label>
            <Input
              id="a-keywords"
              value={form.keywords}
              onChange={(e) => set("keywords", e.target.value)}
              placeholder="memory, migration, Nigerian fiction"
              className="mt-1.5"
              aria-describedby="a-keywords-hint a-keywords-error"
            />
            <p id="a-keywords-hint" className="mt-1 text-xs text-ink-muted">
              Separate keywords with commas.
            </p>
            <FieldError id="a-keywords-error">{err("keywords")}</FieldError>
          </div>
          <div className="md:col-span-2">
            <p id="a-abstract-label" className="text-sm font-medium">
              Abstract
            </p>
            <div className="mt-1.5">
              <RichTextEditor
                id="a-abstract"
                labelledBy="a-abstract-label"
                value={form.abstract}
                onChange={(v) => set("abstract", v)}
                allowHeadings={false}
              />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="authors-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="authors-title" className="text-lg font-semibold">
            Authors
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAuthors((list) => [...list, emptyAuthor()]);
              setDirty(true);
            }}
          >
            <Plus aria-hidden /> Add author
          </Button>
        </div>
        <p className="text-sm text-ink-muted">
          Drag or use the arrows to set the author order. Emails are private unless you tick “Show email”.
        </p>
        <FieldError id="authors-error">{err("authors")}</FieldError>
        <SortableList
          items={authors}
          getId={(a) => a.key}
          getLabel={(a) => a.fullName || "author"}
          onChange={(next) => {
            setAuthors(next);
            setDirty(true);
          }}
          render={(a, i) => (
            <div className="grid gap-3 py-1 md:grid-cols-[1.2fr_1.6fr_1.2fr_1fr_auto]">
              <div>
                <Label htmlFor={`au-${a.key}-name`} className="text-xs">
                  Name
                </Label>
                <Input
                  id={`au-${a.key}-name`}
                  value={a.fullName}
                  onChange={(e) => setAuthor(a.key, { fullName: e.target.value })}
                  className="mt-1 h-9"
                  aria-invalid={err(`authors.${i}.fullName`) ? true : undefined}
                />
                <FieldError id={`au-${a.key}-name-error`}>{err(`authors.${i}.fullName`)}</FieldError>
              </div>
              <div>
                <Label htmlFor={`au-${a.key}-aff`} className="text-xs">
                  Affiliation
                </Label>
                <Input
                  id={`au-${a.key}-aff`}
                  value={a.affiliation}
                  onChange={(e) => setAuthor(a.key, { affiliation: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label htmlFor={`au-${a.key}-email`} className="text-xs">
                  Email
                </Label>
                <Input
                  id={`au-${a.key}-email`}
                  type="email"
                  value={a.email}
                  onChange={(e) => setAuthor(a.key, { email: e.target.value })}
                  className="mt-1 h-9"
                  aria-invalid={err(`authors.${i}.email`) ? true : undefined}
                />
                <FieldError id={`au-${a.key}-email-error`}>{err(`authors.${i}.email`)}</FieldError>
              </div>
              <div>
                <Label htmlFor={`au-${a.key}-orcid`} className="text-xs">
                  ORCID
                </Label>
                <Input
                  id={`au-${a.key}-orcid`}
                  value={a.orcid}
                  onChange={(e) => setAuthor(a.key, { orcid: e.target.value })}
                  placeholder="0000-0000-0000-0000"
                  className="mt-1 h-9"
                  aria-invalid={err(`authors.${i}.orcid`) ? true : undefined}
                />
                <FieldError id={`au-${a.key}-orcid-error`}>{err(`authors.${i}.orcid`)}</FieldError>
              </div>
              <div className="flex items-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  disabled={authors.length === 1}
                  aria-label={`Remove ${a.fullName || "this author"}`}
                  onClick={() => {
                    setAuthors((list) => list.filter((x) => x.key !== a.key));
                    setDirty(true);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-ink-muted md:col-span-5">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={a.showEmail}
                    onChange={(e) => setAuthor(a.key, { showEmail: e.target.checked })}
                  />{" "}
                  Show email publicly
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="corresponding"
                    checked={a.isCorresponding}
                    onChange={() => setAuthor(a.key, { isCorresponding: true })}
                  />{" "}
                  Corresponding author
                </label>
              </div>
            </div>
          )}
        />
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <Button onClick={save} disabled={pending || (!dirty && !isNew)}>
          {pending ? "Saving…" : isNew ? "Create draft article" : "Save article"}
        </Button>
        {dirty ? <span className="text-sm text-ink-muted">Unsaved changes</span> : null}
      </div>

      {article ? (
        <section aria-labelledby="files-title" className="space-y-3">
          <h2 id="files-title" className="text-lg font-semibold">
            Files
          </h2>
          <p className="text-sm text-ink-muted">
            The final formatted PDF and Word versions readers download. A missing format simply isn&rsquo;t
            offered.
          </p>
          <FileSlot
            slot="article_pdf"
            entityId={article.id}
            version={version}
            onVersion={setVersion}
            current={article.files.article_pdf}
          />
          <FileSlot
            slot="article_docx"
            entityId={article.id}
            version={version}
            onVersion={setVersion}
            current={article.files.article_docx}
          />
        </section>
      ) : (
        <p className="text-sm text-ink-muted">
          You can upload the PDF and Word files after creating the draft.
        </p>
      )}

      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this article?"
        description="It disappears from the site, search and its issue's contents until you publish it again."
        confirmLabel="Unpublish"
        destructive
        onConfirm={() => status("unpublish")}
      />
      <ConfirmDialog
        open={confirm === "trash"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Move this article to the trash?"
        description="It's unpublished and hidden. You can restore it from this page or from the trash filter on the articles list."
        confirmLabel="Move to trash"
        destructive
        onConfirm={() => status("trash")}
      />
    </div>
  );
}

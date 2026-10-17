"use client";

import { CheckCircle2, CircleAlert, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { matchFileToRow } from "@/lib/admin/bulk-match";
import { CSV_COLUMNS, parseCsv } from "@/lib/admin/csv";
import { checkFile } from "@/lib/admin/file-slots";
import { slugify } from "@/lib/admin/slug";
import { uploadToSlot } from "@/lib/admin/upload-client";
import { cn } from "@/lib/utils";
import { saveArticle } from "../../../articles/actions";

export interface ExistingArticle {
  id: string;
  version: number;
  title: string;
  firstPage: number | null;
  lastPage: number | null;
  categoryId: string | null;
  citationStyle: "apa7" | "mla8";
  authors: string[];
}

interface Row {
  key: string;
  articleId?: string;
  version?: number;
  title: string;
  authors: string;
  affiliations: string;
  categoryId: string;
  firstPage: string;
  lastPage: string;
  keywords: string;
  abstract: string;
  citationStyle: "apa7" | "mla8";
  pdfFileName?: string;
  docxFileName?: string;
  state: "ready" | "creating" | "created" | "error";
  error?: string;
}

interface QueuedFile {
  id: string;
  file: File;
  slot: "article_pdf" | "article_docx";
  rowKey: string | null;
  status: "waiting" | "uploading" | "done" | "error";
  progress: number;
  message?: string;
}

const PARALLEL_UPLOADS = 3; // backpressure (item 44)
let seq = 0;
const nextKey = (p: string) => `${p}${++seq}`;

function splitList(text: string): string[] {
  return text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BulkUploader({
  issueId,
  issueLabel,
  existing,
  categories,
}: {
  issueId: string;
  issueLabel: string;
  existing: ExistingArticle[];
  categories: { id: string; name: string; slug: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(
    existing.map((a) => ({
      key: nextKey("e"),
      articleId: a.id,
      version: a.version,
      title: a.title,
      authors: a.authors.join("; "),
      affiliations: "",
      categoryId: a.categoryId ?? "",
      firstPage: a.firstPage ? String(a.firstPage) : "",
      lastPage: a.lastPage ? String(a.lastPage) : "",
      keywords: "",
      abstract: "",
      citationStyle: a.citationStyle,
      state: "created",
    })),
  );
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const work = rows.some((r) => !r.articleId) || files.some((f) => f.status !== "done");
  useUnsavedChanges(work && !running);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchFile = (id: string, patch: Partial<QueuedFile>) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const matchable = (list: Row[]) =>
    list.map((r) => ({
      key: r.key,
      title: r.title,
      authors: splitList(r.authors),
      firstPage: r.firstPage ? Number(r.firstPage) : null,
      pdfFileName: r.pdfFileName,
      docxFileName: r.docxFileName,
    }));

  function blankRow(): Row {
    return {
      key: nextKey("n"),
      title: "",
      authors: "",
      affiliations: "",
      categoryId: "",
      firstPage: "",
      lastPage: "",
      keywords: "",
      abstract: "",
      citationStyle: "mla8",
      state: "ready",
    };
  }

  async function importCsv(file: File) {
    const { headers, rows: records } = parseCsv(await file.text());
    if (!headers.includes("title"))
      return void toast.error(`The CSV needs a "title" column. Expected columns: ${CSV_COLUMNS.join(", ")}.`);
    const byName = (value: string) => {
      const v = value.trim().toLowerCase();
      return categories.find((c) => c.name.toLowerCase() === v || c.slug === v)?.id ?? "";
    };
    const imported: Row[] = records
      .filter((r) => r.title)
      .map((r) => ({
        ...blankRow(),
        title: r.title,
        authors: r.authors ?? "",
        affiliations: r.affiliations ?? "",
        categoryId: byName(r.category ?? ""),
        firstPage: r.first_page ?? "",
        lastPage: r.last_page ?? "",
        keywords: r.keywords ?? "",
        abstract: r.abstract ?? "",
        citationStyle: (r.citation_style ?? "").toLowerCase().startsWith("apa") ? "apa7" : "mla8",
        pdfFileName: r.pdf_filename || undefined,
        docxFileName: r.docx_filename || undefined,
      }));
    setRows((list) => {
      const next = [...list, ...imported];
      // Re-match any files already dropped against the new rows.
      setFiles((fs) =>
        fs.map((f) => (f.rowKey ? f : { ...f, rowKey: matchFileToRow(f.file.name, matchable(next)) })),
      );
      return next;
    });
    toast.success(`${imported.length} articles imported from the CSV.`);
  }

  function addFiles(list: FileList | File[]) {
    const added: QueuedFile[] = [];
    for (const file of Array.from(list)) {
      const slot = file.name.toLowerCase().endsWith(".docx") ? "article_docx" : "article_pdf";
      const problem = checkFile(slot, file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      added.push({
        id: nextKey("f"),
        file,
        slot,
        rowKey: matchFileToRow(file.name, matchable(rows)),
        status: "waiting",
        progress: 0,
      });
    }
    setFiles((fs) => [...fs, ...added]);
  }

  async function createRow(row: Row): Promise<{ id: string; version: number } | null> {
    patchRow(row.key, { state: "creating", error: undefined });
    const authors = splitList(row.authors);
    const affiliations = splitList(row.affiliations);
    const r = await saveArticle({
      issueId,
      categoryId: row.categoryId,
      title: row.title,
      slug: slugify(row.title),
      abstract: row.abstract
        ? `<p>${row.abstract
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/\n{2,}/g, "</p><p>")}</p>`
        : "",
      keywords: row.keywords
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
      firstPage: row.firstPage,
      lastPage: row.lastPage,
      doi: "",
      citationStyle: row.citationStyle,
      publishedAt: "",
      authors: authors.map((name, i) => ({
        fullName: name,
        affiliation: affiliations[i] ?? affiliations[0] ?? "",
        isCorresponding: i === 0,
      })),
    });
    if (!r.ok || !r.data) {
      const detail = r.ok ? "" : (Object.values(r.fieldErrors ?? {})[0] ?? r.message);
      patchRow(row.key, { state: "error", error: detail || "Could not create" });
      return null;
    }
    patchRow(row.key, { state: "created", articleId: r.data.id, version: r.data.version });
    return r.data;
  }

  async function start() {
    const unmatched = files.filter((f) => f.status !== "done" && !f.rowKey);
    if (unmatched.length)
      return void toast.error(
        `Choose an article for ${unmatched.length} unmatched file${unmatched.length === 1 ? "" : "s"} first.`,
      );
    setRunning(true);

    // 1. Create the new articles one at a time (each is a small transaction).
    const ids = new Map<string, { id: string; version: number }>();
    for (const row of rows) {
      if (row.articleId) ids.set(row.key, { id: row.articleId, version: row.version ?? 1 });
      else if (row.title.trim()) {
        const created = await createRow(row);
        if (created) ids.set(row.key, created);
      }
    }

    // 2. Upload: at most PARALLEL_UPLOADS articles at once; one article's
    //    files go one after another, since each upload bumps its version.
    const groups = new Map<string, QueuedFile[]>();
    for (const f of files)
      if (f.status !== "done" && f.rowKey) groups.set(f.rowKey, [...(groups.get(f.rowKey) ?? []), f]);
    const queue = [...groups.entries()];
    let failed = 0;
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [rowKey, group] = next;
        const target = ids.get(rowKey);
        for (const f of group) {
          if (!target) {
            patchFile(f.id, { status: "error", message: "Its article could not be created." });
            failed++;
            continue;
          }
          patchFile(f.id, { status: "uploading", progress: 0, message: undefined });
          const r = await uploadToSlot(f.slot, target.id, f.file, target.version, (p) =>
            patchFile(f.id, { progress: p }),
          );
          if (r.ok && r.data) {
            target.version = r.data.version;
            patchFile(f.id, { status: "done", progress: 1 });
          } else {
            failed++;
            patchFile(f.id, { status: "error", message: r.ok ? "Upload failed" : r.message });
          }
        }
        setRows((list) => list.map((r) => (r.key === rowKey ? { ...r, version: target?.version } : r)));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
    setRunning(false);
    if (failed)
      toast.error(
        `${failed} file${failed === 1 ? "" : "s"} failed. Fix the problem and press Start again to retry only those.`,
      );
    else toast.success("All done. The new articles are saved as drafts.");
  }

  const pendingRows = rows.filter((r) => !r.articleId && r.title.trim()).length;
  const pendingFiles = files.filter((f) => f.status !== "done").length;

  return (
    <div className="mt-6 space-y-8">
      <ol className="grid gap-3 text-sm text-ink-muted md:grid-cols-3">
        <li className="rounded-lg border border-line bg-white p-4">
          <strong className="text-ink">1. Articles.</strong> Import a CSV of article details, or add rows by
          hand. Existing articles in {issueLabel} are listed too.
        </li>
        <li className="rounded-lg border border-line bg-white p-4">
          <strong className="text-ink">2. Files.</strong> Drop all the PDF and Word files. Each is matched to
          an article by file name; fix any that aren&rsquo;t.
        </li>
        <li className="rounded-lg border border-line bg-white p-4">
          <strong className="text-ink">3. Start.</strong> New articles are created as drafts and files upload
          three at a time. Publish from the issue page when you&rsquo;re happy.
        </li>
      </ol>

      <section aria-labelledby="rows-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rows-title" className="text-lg font-semibold">
            Articles ({rows.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => csvInput.current?.click()} disabled={running}>
              <FileText aria-hidden /> Import CSV
            </Button>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a CSV file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importCsv(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((l) => [...l, blankRow()])}
              disabled={running}
            >
              <Plus aria-hidden /> Add row
            </Button>
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          CSV columns: {CSV_COLUMNS.join(", ")}. Separate several authors (and their affiliations) with
          semicolons.
        </p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-white p-6 text-center text-sm text-ink-muted">
            No articles yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-line bg-paper/70 text-left text-xs tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Authors (; separated)</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="w-36 px-3 py-2">Pages</th>
                  <th className="px-3 py-2">Style</th>
                  <th className="w-28 px-3 py-2">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const locked = Boolean(r.articleId) || running;
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="px-3 py-2">
                        <Input
                          aria-label="Title"
                          value={r.title}
                          disabled={locked}
                          onChange={(e) => patchRow(r.key, { title: e.target.value })}
                          className="h-9"
                        />
                        {r.error ? <p className="mt-1 text-xs text-coral-ink">{r.error}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label="Authors"
                          value={r.authors}
                          disabled={locked}
                          onChange={(e) => patchRow(r.key, { authors: e.target.value })}
                          className="h-9"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NativeSelect
                          aria-label="Category"
                          value={r.categoryId}
                          disabled={locked}
                          onChange={(e) => patchRow(r.key, { categoryId: e.target.value })}
                          className="h-9"
                        >
                          <option value="">—</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Input
                            aria-label="First page"
                            value={r.firstPage}
                            disabled={locked}
                            onChange={(e) => patchRow(r.key, { firstPage: e.target.value })}
                            className="h-9"
                            inputMode="numeric"
                          />
                          <Input
                            aria-label="Last page"
                            value={r.lastPage}
                            disabled={locked}
                            onChange={(e) => patchRow(r.key, { lastPage: e.target.value })}
                            className="h-9"
                            inputMode="numeric"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <NativeSelect
                          aria-label="Citation style"
                          value={r.citationStyle}
                          disabled={locked}
                          onChange={(e) =>
                            patchRow(r.key, { citationStyle: e.target.value as "apa7" | "mla8" })
                          }
                          className="h-9 w-24"
                        >
                          <option value="mla8">MLA</option>
                          <option value="apa7">APA</option>
                        </NativeSelect>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.articleId ? (
                          <Link href={`/admin/articles/${r.articleId}`} className="font-medium">
                            {r.state === "created" && !existing.some((e) => e.id === r.articleId)
                              ? "Created"
                              : "Existing"}
                          </Link>
                        ) : r.state === "creating" ? (
                          "Creating…"
                        ) : r.state === "error" ? (
                          <span className="text-coral-ink">Not created</span>
                        ) : (
                          <span className="text-ink-muted">New</span>
                        )}
                      </td>
                      <td className="px-1 py-2">
                        {!r.articleId ? (
                          <button
                            type="button"
                            disabled={running}
                            onClick={() => {
                              setRows((l) => l.filter((x) => x.key !== r.key));
                              setFiles((fs) =>
                                fs.map((f) => (f.rowKey === r.key ? { ...f, rowKey: null } : f)),
                              );
                            }}
                            className="rounded p-1.5 text-ink-muted hover:bg-paper hover:text-coral-ink"
                            aria-label={`Remove row ${r.title || "untitled"}`}
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="files-title" className="space-y-3">
        <h2 id="files-title" className="text-lg font-semibold">
          Files ({files.length})
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!running) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm",
            dragOver ? "border-royal bg-[#E8EDFA]" : "border-line bg-white",
          )}
        >
          <Upload aria-hidden className="size-6 text-ink-muted" />
          <p>
            Drop article PDF and Word files here, or{" "}
            <button
              type="button"
              className="font-semibold text-navy underline"
              onClick={() => fileInput.current?.click()}
              disabled={running}
            >
              choose files
            </button>
            .
          </p>
          <p className="text-xs text-ink-muted">
            Up to 50 MB each. File names containing the first author&rsquo;s surname or the first page number
            match automatically.
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.docx"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose article files"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" aria-live="polite">
            {files.map((f) => (
              <li
                key={f.id}
                className="grid items-center gap-3 px-4 py-2.5 text-sm md:grid-cols-[1.4fr_1.6fr_10rem_auto]"
              >
                <span className="min-w-0 truncate" title={f.file.name}>
                  <span className="mr-2 rounded bg-paper px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase">
                    {f.slot === "article_pdf" ? "PDF" : "Word"}
                  </span>
                  {f.file.name}
                </span>
                <NativeSelect
                  aria-label={`Article for ${f.file.name}`}
                  value={f.rowKey ?? ""}
                  disabled={running || f.status === "done"}
                  onChange={(e) => patchFile(f.id, { rowKey: e.target.value || null })}
                  className={cn("h-9", !f.rowKey && "border-gold")}
                >
                  <option value="">Choose the article…</option>
                  {rows.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.title || "(untitled row)"}
                    </option>
                  ))}
                </NativeSelect>
                <span>
                  {f.status === "uploading" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <span
                          className="block h-full bg-royal"
                          style={{ width: `${Math.round(f.progress * 100)}%` }}
                        />
                      </span>
                      <span className="w-9 text-xs text-ink-muted">{Math.round(f.progress * 100)}%</span>
                    </span>
                  ) : f.status === "done" ? (
                    <span className="flex items-center gap-1.5 text-[#2F6B22]">
                      <CheckCircle2 aria-hidden className="size-4" /> Uploaded
                    </span>
                  ) : f.status === "error" ? (
                    <span className="flex items-center gap-1.5 text-coral-ink" title={f.message}>
                      <CircleAlert aria-hidden className="size-4" /> {f.message ?? "Failed"}
                    </span>
                  ) : running ? (
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <Loader2 aria-hidden className="size-4 animate-spin" /> Waiting
                    </span>
                  ) : (
                    <span className="text-ink-muted">{f.rowKey ? "Matched" : "Not matched"}</span>
                  )}
                </span>
                <span>
                  {f.status !== "done" && !running ? (
                    <button
                      type="button"
                      onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                      className="rounded p-1.5 text-ink-muted hover:bg-paper hover:text-coral-ink"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <Button onClick={start} disabled={running || (pendingRows === 0 && pendingFiles === 0)}>
          {running ? "Working…" : "Start"}
        </Button>
        <span className="text-sm text-ink-muted">
          {pendingRows} new {pendingRows === 1 ? "article" : "articles"} to create · {pendingFiles}{" "}
          {pendingFiles === 1 ? "file" : "files"} to upload
        </span>
        <Link href={`/admin/issues/${issueId}`} className="ml-auto text-sm font-semibold">
          Back to the issue →
        </Link>
      </div>
    </div>
  );
}

"use client";

import { Check, Copy, FileDown } from "lucide-react";
import { useId, useState } from "react";
import type { FormattedCitation } from "@/lib/citations";

type Tab = "apa" | "mla" | "bibtex";

const LABELS: Record<Tab, string> = { apa: "APA 7th", mla: "MLA 8th", bibtex: "BibTeX" };

async function copyRich(plain: string, html?: string) {
  // Rich copy keeps the italics when pasted into Word or Google Docs; plain
  // text is the fallback everywhere else.
  if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([plain], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(plain);
}

export function CitePanel({
  apa,
  mla,
  bibtex,
  ris,
  risFileName,
}: {
  apa: FormattedCitation;
  mla: FormattedCitation;
  bibtex: string;
  ris: string;
  risFileName: string;
}) {
  const [tab, setTab] = useState<Tab>("apa");
  const [copied, setCopied] = useState<Tab | null>(null);
  const id = useId();

  const current = tab === "bibtex" ? null : tab === "apa" ? apa : mla;

  async function copy() {
    try {
      if (current) await copyRich(current.plain, current.html);
      else await copyRich(bibtex);
      setCopied(tab);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  function downloadRis() {
    const url = URL.createObjectURL(new Blob([ris], { type: "application/x-research-info-systems" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = risFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-line bg-white">
      <h2 id={`${id}-title`} className="border-b border-line px-5 py-4 text-base font-semibold">
        Cite this article
      </h2>
      <div role="tablist" aria-label="Citation format" className="flex border-b border-line px-2">
        {(Object.keys(LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            id={`${id}-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const keys = Object.keys(LABELS) as Tab[];
              const i = keys.indexOf(tab);
              if (e.key === "ArrowRight") setTab(keys[(i + 1) % keys.length]);
              if (e.key === "ArrowLeft") setTab(keys[(i + keys.length - 1) % keys.length]);
            }}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? "border-coral text-navy" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="p-5">
        {current ? (
          <p className="font-serif text-[0.98rem] leading-relaxed break-words">
            {current.segments.map((s, i) =>
              s.italic ? <i key={i}>{s.text}</i> : <span key={i}>{s.text}</span>,
            )}
          </p>
        ) : (
          <pre className="max-h-64 overflow-auto rounded bg-paper p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {bibtex}
          </pre>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-royal"
          >
            {copied === tab ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied === tab ? "Copied" : `Copy ${LABELS[tab]}`}
          </button>
          <button
            type="button"
            onClick={downloadRis}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-navy hover:border-navy"
          >
            <FileDown aria-hidden className="size-4" />
            Download .ris
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? `${LABELS[copied]} citation copied to clipboard` : ""}
        </p>
      </div>
    </section>
  );
}

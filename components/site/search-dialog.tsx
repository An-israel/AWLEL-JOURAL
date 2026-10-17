"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Header search icon: opens a site-wide search box that goes to /search. */
export function SearchDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          input.current?.focus();
        }}
        className="inline-flex size-11 items-center justify-center rounded-md text-navy hover:bg-paper"
        aria-label="Search the journal"
        aria-haspopup="dialog"
      >
        <Search aria-hidden className="size-5" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Search the journal"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
        className="mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] max-w-none rounded-lg bg-white p-0 shadow-2xl backdrop:bg-ink/50"
      >
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            dialog.current?.close();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
          className="flex items-center gap-2 p-3"
        >
          <Search aria-hidden className="ml-2 size-5 shrink-0 text-ink-muted" />
          <label htmlFor="site-search" className="sr-only">
            Search articles, authors and keywords
          </label>
          <input
            ref={input}
            id="site-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles, authors, keywords…"
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-lg outline-none placeholder:text-ink-muted/70"
            autoComplete="off"
            maxLength={200}
          />
          <button
            type="submit"
            className="rounded-md bg-navy px-4 py-2.5 font-medium text-white hover:bg-royal"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-paper"
            aria-label="Close search"
          >
            <X aria-hidden className="size-5" />
          </button>
        </form>
        <p className="border-t border-line px-5 py-3 text-sm text-ink-muted">
          Searches titles, abstracts, keywords and author names across every issue.
        </p>
      </dialog>
    </>
  );
}

"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export interface SortableItem {
  key: string;
  publishedAt: string | null;
  views: number;
  node: ReactNode;
}

/** Newest / most read toggle over server-rendered rows. */
export function SortableList({ items }: { items: SortableItem[] }) {
  const [sort, setSort] = useState<"newest" | "read">("newest");
  const sorted = [...items].sort((a, b) =>
    sort === "read"
      ? b.views - a.views || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
      : (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-navy pb-3">
        <p className="text-sm text-ink-muted">
          {items.length} {items.length === 1 ? "article" : "articles"}
        </p>
        <div
          role="group"
          aria-label="Sort articles"
          className="inline-flex rounded-md border border-line bg-white p-0.5"
        >
          {(
            [
              ["newest", "Newest"],
              ["read", "Most read"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === value ? "bg-navy text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line">
        {sorted.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
      </div>
    </>
  );
}

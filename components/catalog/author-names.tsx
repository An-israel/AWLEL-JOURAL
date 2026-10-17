import type { AuthorSummary } from "@/lib/data/catalog";

/** "A, B and C" — the compact author line used in lists. */
export function authorLine(authors: AuthorSummary[]): string {
  const names = authors.map((a) => a.fullName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function AuthorNames({ authors, className }: { authors: AuthorSummary[]; className?: string }) {
  if (authors.length === 0) return null;
  return <p className={className ?? "text-[0.95rem] text-ink-muted"}>{authorLine(authors)}</p>;
}

import Link from "next/link";

/** Previous / "Page 2 of 5" / Next links for a paged list. */
export function Pagination({
  page,
  pages,
  hrefFor,
  label,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-8 flex items-center justify-between border-t border-line pt-6">
      {page > 1 ? (
        <Link href={hrefFor(Math.min(page - 1, pages))} rel="prev" className="font-semibold">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" className="font-semibold">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Shown instead of results when a page number is past the end. */
export function PastTheEnd({ pages, firstHref }: { pages: number; firstHref: string }) {
  return (
    <p className="mt-6 text-ink-muted">
      There {pages === 1 ? "is only 1 page" : `are only ${pages} pages`} of results —{" "}
      <Link href={firstHref}>go to page 1</Link>.
    </p>
  );
}

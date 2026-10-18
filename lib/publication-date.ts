// The date an article counts as published, for display and for citation
// metadata (item 22). Back-catalogue articles added to the site years after
// their issue appeared carry the upload date in published_at; for those the
// issue's own year and month are the true publication date.

export interface PublicationDate {
  /** ISO 8601 at the known precision: "2026-06-30", "2005-06" or "2005". */
  iso: string;
  precision: "day" | "month" | "year";
  year: number;
  /** 1–12, or null when only the year is known. */
  month: number | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The article's own publication timestamp when it falls within (or before)
 * its issue's month, otherwise the issue's year and month.
 */
export function articlePublicationDate(
  publishedAt: string | null,
  issue: { year: number; month: number | null },
): PublicationDate {
  const fromIssue: PublicationDate = issue.month
    ? { iso: `${issue.year}-${pad(issue.month)}`, precision: "month", year: issue.year, month: issue.month }
    : { iso: String(issue.year), precision: "year", year: issue.year, month: null };
  if (!publishedAt) return fromIssue;

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return fromIssue;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const later = issue.month ? year * 12 + month > issue.year * 12 + issue.month : year > issue.year;
  if (later) return fromIssue;
  return { iso: date.toISOString().slice(0, 10), precision: "day", year, month };
}

/** "30 June 2026", "June 2005" or "2005". */
export function formatPublicationDate(d: PublicationDate): string {
  if (d.precision === "year" || d.month == null) return String(d.year);
  const monthYear = `${MONTHS[d.month - 1]} ${d.year}`;
  return d.precision === "month" ? monthYear : `${Number(d.iso.slice(8, 10))} ${monthYear}`;
}

/**
 * Google Scholar's citation_publication_date: "2026/06/30", or just the year,
 * the only two forms its inclusion guidelines accept.
 */
export function scholarPublicationDate(d: PublicationDate): string {
  return d.precision === "day" ? d.iso.replace(/-/g, "/") : String(d.year);
}

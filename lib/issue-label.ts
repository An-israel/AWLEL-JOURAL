// How an issue is labelled everywhere on the site (section 4).

export const MONTHS = [
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
] as const;

export interface IssueLabelInput {
  volumeNumber: number;
  year: number;
  issueNumber: number;
  month?: number | null;
  legacyNumber?: number | null;
  /** Number of issues in this volume (published ones, on the public site). */
  issuesInVolume: number;
}

function monthName(month: number | null | undefined): string | null {
  if (month == null || month < 1 || month > 12) return null;
  return MONTHS[month - 1];
}

/**
 * "Volume 25, Issue 1 (June 2025)": always with the issue number, even when a
 * volume has a single issue, so every citation leads to one issue.
 */
export function issueLabel(input: IssueLabelInput): string {
  const month = monthName(input.month);
  const when = month ? `${month} ${input.year}` : String(input.year);
  return `Volume ${input.volumeNumber}, Issue ${input.issueNumber} (${when})`;
}

/** Secondary label for older issues numbered in a running sequence: "No. 19". */
export function legacyLabel(legacyNumber: number | null | undefined): string | null {
  return legacyNumber ? `No. ${legacyNumber}` : null;
}

/** Compact form for file names: "Vol25_Issue1". */
export function issueFileStem(input: Pick<IssueLabelInput, "volumeNumber" | "issueNumber">): string {
  return `Vol${input.volumeNumber}_Issue${input.issueNumber}`;
}

/** Public URL path of an issue. */
export function issuePath(volumeNumber: number, issueNumber: number): string {
  return `/issues/${volumeNumber}/${issueNumber}`;
}

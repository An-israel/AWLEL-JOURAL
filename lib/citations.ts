// "Cite this article" (section 12): APA 7th, MLA 8th, BibTeX and RIS from
// article metadata. Pure functions, so they are unit tested and usable on
// both server and client.

export interface CitationAuthor {
  fullName: string;
}

export interface CitationInput {
  authors: CitationAuthor[];
  title: string;
  journal: string;
  year: number;
  volume: number;
  /** Omit for volumes with a single issue (matches the site's issue labels). */
  issue?: number | null;
  firstPage?: number | null;
  lastPage?: number | null;
  doi?: string | null;
  url: string;
  issn?: string;
  publisher?: string;
  keywords?: string[];
  /** Plain-text abstract for RIS. */
  abstract?: string | null;
}

/** A run of citation text; `italic` runs render as <i> and in rich-text copies. */
export interface Segment {
  text: string;
  italic?: boolean;
}

export interface FormattedCitation {
  segments: Segment[];
  plain: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

export interface ParsedName {
  family: string;
  given: string;
  suffix?: string;
}

/**
 * Splits a display name into family and given names. "Surname, Given" is
 * honoured as written; otherwise the last word is the family name.
 */
export function parseName(fullName: string): ParsedName {
  const name = fullName.trim().replace(/\s+/g, " ");
  if (name.includes(",")) {
    const [family, ...rest] = name.split(",").map((part) => part.trim());
    return { family, given: rest.join(" ").trim() };
  }
  const parts = name.split(" ");
  let suffix: string | undefined;
  if (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    suffix = parts.pop();
  }
  const family = parts.pop() ?? name;
  return { family, given: parts.join(" "), suffix };
}

/** "Ngozi Adaeze" -> "N. A."; "Jean-Paul" -> "J.-P."; existing initials kept. */
export function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((piece) => `${piece.replace(/\.$/, "").charAt(0).toUpperCase()}.`)
        .join("-"),
    )
    .join(" ");
}

function apaName(author: CitationAuthor): string {
  const { family, given, suffix } = parseName(author.fullName);
  const init = initials(given);
  return [family, init, suffix].filter(Boolean).join(", ");
}

function mlaInverted(author: CitationAuthor): string {
  const { family, given, suffix } = parseName(author.fullName);
  return [family, given, suffix].filter(Boolean).join(", ");
}

function mlaNatural(author: CitationAuthor): string {
  const { family, given, suffix } = parseName(author.fullName);
  return [[given, family].filter(Boolean).join(" "), suffix].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EN_DASH = "\u2013";

function pages(input: CitationInput): string | null {
  if (!input.firstPage) return null;
  return input.lastPage && input.lastPage !== input.firstPage
    ? `${input.firstPage}${EN_DASH}${input.lastPage}`
    : String(input.firstPage);
}

/** Adds a full stop unless the text already ends with terminal punctuation. */
function terminate(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

function doiUrl(doi: string): string {
  return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function finish(segments: Segment[]): FormattedCitation {
  const merged = segments.filter((s) => s.text.length > 0);
  return {
    segments: merged,
    plain: merged.map((s) => s.text).join(""),
    html: merged.map((s) => (s.italic ? `<i>${escapeHtml(s.text)}</i>` : escapeHtml(s.text))).join(""),
  };
}

// ---------------------------------------------------------------------------
// APA 7th
// ---------------------------------------------------------------------------

/** APA 7: up to 20 authors with "&" before the last; 21+ uses 19, an ellipsis, then the last. */
export function apaAuthors(authors: CitationAuthor[]): string {
  const names = authors.map(apaName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
}

export function formatApa(input: CitationInput): FormattedCitation {
  const authors = apaAuthors(input.authors);
  const range = pages(input);
  const segments: Segment[] = [];

  if (authors) {
    segments.push({ text: `${terminate(authors)} (${input.year}). ${terminate(input.title)} ` });
  } else {
    segments.push({ text: `${terminate(input.title)} (${input.year}). ` });
  }
  segments.push({ text: input.journal, italic: true }, { text: ", " });
  segments.push({ text: String(input.volume), italic: true });
  if (input.issue) segments.push({ text: `(${input.issue})` });
  segments.push({ text: range ? `, ${range}.` : "." });
  // APA 7 (9.34): a DOI when there is one; otherwise the article's own page,
  // because an open-access journal article online has a URL that works for
  // every reader. Neither is followed by a full stop.
  segments.push({ text: ` ${input.doi ? doiUrl(input.doi) : input.url}` });
  return finish(segments);
}

// ---------------------------------------------------------------------------
// MLA 8th
// ---------------------------------------------------------------------------

/** MLA 8: one author inverted; two joined with "and"; three or more use "et al." */
export function mlaAuthors(authors: CitationAuthor[]): string {
  if (authors.length === 0) return "";
  if (authors.length === 1) return mlaInverted(authors[0]);
  if (authors.length === 2) return `${mlaInverted(authors[0])}, and ${mlaNatural(authors[1])}`;
  return `${mlaInverted(authors[0])}, et al`;
}

export function formatMla(input: CitationInput): FormattedCitation {
  const authors = mlaAuthors(input.authors);
  const range = pages(input);
  const segments: Segment[] = [];

  if (authors) segments.push({ text: `${terminate(authors)} ` });
  segments.push({ text: `\u201c${terminate(input.title)}\u201d ` });
  segments.push({ text: input.journal, italic: true });

  const parts = [`vol. ${input.volume}`];
  if (input.issue) parts.push(`no. ${input.issue}`);
  parts.push(String(input.year));
  if (range) parts.push(`${range.includes(EN_DASH) ? "pp." : "p."} ${range}`);
  segments.push({ text: `, ${parts.join(", ")}.` });
  // MLA 8 ends an online source with its DOI or, failing that, its URL
  // without the "https://".
  if (input.doi) segments.push({ text: ` doi:${input.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}.` });
  else segments.push({ text: ` ${input.url.replace(/^https?:\/\//i, "")}.` });
  return finish(segments);
}

// ---------------------------------------------------------------------------
// BibTeX and RIS
// ---------------------------------------------------------------------------

function bibEscape(text: string): string {
  return text.replace(/([&%$#_])/g, "\\$1").replace(/[{}]/g, "");
}

export function citationKey(input: CitationInput): string {
  const family = input.authors[0] ? parseName(input.authors[0].fullName).family : "awlel";
  const firstWord =
    input.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .find((w) => w.length > 3 && !["the", "and", "with", "from", "this"].includes(w)) ?? "article";
  const base = family.normalize("NFKD").replace(/[^\w]/g, "").toLowerCase();
  return `${base}${input.year}${firstWord}`;
}

export function formatBibtex(input: CitationInput): string {
  const fields: [string, string][] = [
    ["author", input.authors.map((a) => mlaInverted(a)).join(" and ")],
    ["title", `{${bibEscape(input.title)}}`],
    ["journal", bibEscape(input.journal)],
    ["year", String(input.year)],
    ["volume", String(input.volume)],
  ];
  if (input.issue) fields.push(["number", String(input.issue)]);
  if (input.firstPage) {
    fields.push([
      "pages",
      input.lastPage && input.lastPage !== input.firstPage
        ? `${input.firstPage}--${input.lastPage}`
        : String(input.firstPage),
    ]);
  }
  if (input.issn) fields.push(["issn", input.issn]);
  if (input.publisher) fields.push(["publisher", bibEscape(input.publisher)]);
  if (input.doi) fields.push(["doi", input.doi]);
  fields.push(["url", input.url]);
  if (input.keywords?.length) fields.push(["keywords", bibEscape(input.keywords.join(", "))]);

  const body = fields.map(([k, v]) => `  ${k} = {${k === "author" ? bibEscape(v) : v}}`).join(",\n");
  return `@article{${citationKey(input)},\n${body}\n}\n`;
}

export function formatRis(input: CitationInput): string {
  const lines: string[] = ["TY  - JOUR"];
  for (const author of input.authors) lines.push(`AU  - ${mlaInverted(author)}`);
  lines.push(`TI  - ${input.title}`, `JO  - ${input.journal}`, `T2  - ${input.journal}`);
  lines.push(`PY  - ${input.year}`, `VL  - ${input.volume}`);
  if (input.issue) lines.push(`IS  - ${input.issue}`);
  if (input.firstPage) lines.push(`SP  - ${input.firstPage}`);
  if (input.lastPage) lines.push(`EP  - ${input.lastPage}`);
  if (input.issn) lines.push(`SN  - ${input.issn}`);
  if (input.publisher) lines.push(`PB  - ${input.publisher}`);
  if (input.doi) lines.push(`DO  - ${input.doi}`);
  lines.push(`UR  - ${input.url}`);
  for (const keyword of input.keywords ?? []) lines.push(`KW  - ${keyword}`);
  if (input.abstract) lines.push(`AB  - ${input.abstract.replace(/\s+/g, " ").trim()}`);
  lines.push("ER  - ");
  return `${lines.join("\r\n")}\r\n`;
}

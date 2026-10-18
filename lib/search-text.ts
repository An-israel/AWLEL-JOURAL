// Pure helpers for search, kept free of server imports so they are unit tested.

/**
 * True for the error a fetch gets when Next.js ends a prerender it started
 * in the background (item 39). Nothing has failed: the real request renders
 * the results. It must not be logged as an error or counted by the alert.
 */
export function isPrerenderAbort(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === "AbortError" ||
    (typeof message === "string" && /during prerendering|prerender is complete/i.test(message))
  );
}

// Entities a snippet may still contain after the database has decoded the
// common ones, e.g. &#8217; or &rsquo; from text pasted from Word.
const NAMED: Record<string, string> = {
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  amp: "&",
};

function codePoint(n: number, whole: string): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
}

/** Decodes numeric and common named entities; anything else is left as it is. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== "#") return NAMED[ref.toLowerCase()] ?? whole;
    return codePoint(ref[1].toLowerCase() === "x" ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)), whole);
  });
}

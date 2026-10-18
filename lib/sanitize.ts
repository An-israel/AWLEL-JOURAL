import "server-only";
import sanitizeHtml from "sanitize-html";

// Rich text (abstracts, editorials, static pages) is sanitised on save and
// again on render (item 79). Only editorial markup survives.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "em",
    "strong",
    "i",
    "b",
    "u",
    "s",
    "sup",
    "sub",
    "mark",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h2",
    "h3",
    "h4",
    "hr",
    // Photos on long-form pages such as The Department. The CSP only lets
    // images load from this site and Supabase Storage.
    "figure",
    "figcaption",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "width", "height", "loading"],
  },
  allowedSchemesByTag: { img: ["https", "http"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
      },
    }),
  },
};

export function sanitizeRichText(html: string | null | undefined): string {
  return html ? sanitizeHtml(html, OPTIONS) : "";
}

// Block-level tags and line breaks. Their text must not run into the next
// block's when tags are stripped: "O'Brien</p><p>Next" is two words.
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|figure|figcaption|table|tr|td|th|hr)\b[^>]*>|<br\s*\/?>/gi;

/** Plain text from rich text, for meta descriptions and exports. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html.replace(BLOCK_BOUNDARY, " $& "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Placeholder text (item 19)
// ---------------------------------------------------------------------------

// The seed content marks text still to be supplied as highlighted brackets:
// <mark>[To be confirmed: …]</mark> or <mark>[Placeholder: …]</mark>.
const PLACEHOLDER_MARK = /^\[\s*(?:to be confirmed|to be supplied|placeholder|tbc)\b[\s\S]*\]$/i;
// Bracketed placeholders in short fields, such as a milestone's "[Year]".
const PLACEHOLDER_ANYWHERE = /\[\s*(?:year|placeholder|to be confirmed|to be supplied|tbc)\b[^\]]*\]/i;
const MARK = /<mark\b[^>]*>([\s\S]*?)<\/mark>/gi;
// A private-use character stands in for each removed placeholder while the
// blocks around it are checked, then disappears.
const GAP = "";
const GAP_BLOCKS = new Set(["p", "li", "tr", "blockquote", "figcaption"]);

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** True when text contains an unconfirmed placeholder such as "[Year]" or "[Placeholder] …". */
export function hasPlaceholder(text: string | null | undefined): boolean {
  return Boolean(text && PLACEHOLDER_ANYWHERE.test(text));
}

/**
 * Sanitised page HTML with the placeholder text taken out, for the public
 * site. Editors still see the placeholders in the admin editor, so they know
 * what is left to confirm. A paragraph or list item left empty, or left as a
 * bare label such as "Length:", goes too, and so does a heading whose whole
 * section was placeholders.
 */
export function stripPlaceholders(html: string | null | undefined): string {
  const clean = sanitizeRichText(html);
  const marked = clean.replace(MARK, (whole, inner: string) =>
    PLACEHOLDER_MARK.test(textOf(inner)) ? GAP : whole,
  );
  if (!marked.includes(GAP)) return clean;

  const stripped = sanitizeHtml(marked, {
    ...OPTIONS,
    exclusiveFilter: (frame) => {
      if (GAP_BLOCKS.has(frame.tag) && frame.text.includes(GAP)) {
        const rest = frame.text.replaceAll(GAP, "").replace(/\s+/g, " ").trim();
        return rest === "" || rest.endsWith(":");
      }
      return false;
    },
  })
    .replace(new RegExp(`[ \\t\\u00a0]*${GAP}`, "g"), "")
    // A list whose every item was removed.
    .replace(/<(ul|ol)>\s*<\/\1>/g, "");

  return dropEmptySections(stripped).trim();
}

/** Removes headings with nothing under them before the next heading of the same or a higher level. */
function dropEmptySections(html: string): string {
  const heading = /<h([2-4])\b[^>]*>[\s\S]*?<\/h\1>/gi;
  let out = html;
  let changed = true;
  while (changed) {
    changed = false;
    const found = [...out.matchAll(heading)].map((m) => ({
      level: Number(m[1]),
      start: m.index,
      end: m.index + m[0].length,
    }));
    // Deepest headings first, so an emptied sub-section can empty its parent.
    outer: for (const level of [4, 3, 2]) {
      for (let i = found.length - 1; i >= 0; i--) {
        const h = found[i];
        if (h.level !== level) continue;
        const next = found.slice(i + 1).find((n) => n.level <= h.level);
        const body = out.slice(h.end, next ? next.start : out.length);
        if (textOf(body) === "" && !/<img\b/i.test(body)) {
          out = out.slice(0, h.start) + out.slice(h.end);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}

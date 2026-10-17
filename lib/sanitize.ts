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

/** Plain text from rich text, for meta descriptions and exports. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

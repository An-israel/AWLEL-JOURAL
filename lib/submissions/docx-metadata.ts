import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

/*
 * Double-blind review (item 54): Word records who wrote and last saved a
 * document, and often their organisation, in the file's properties; comments
 * and tracked changes carry their author's name. Authors are asked to remove
 * these, but many don't know how. Uploads go straight from the browser to
 * storage, so this runs in the browser just before an author's upload. The
 * result is still a ZIP (a .docx), so the server's magic-byte check holds.
 */

const XML_TEXT_FIELDS: Record<string, string[]> = {
  "docProps/core.xml": ["dc:creator", "cp:lastModifiedBy"],
  "docProps/app.xml": ["Company", "Manager"],
};

/** Empties the text of each named element, keeping the element itself. */
function blankElements(xml: string, names: string[]): string {
  let out = xml;
  for (const name of names) {
    const tag = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(<${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</${tag}>)`, "g"), "$1$2");
  }
  return out;
}

/** Comments, tracked changes and the people list name their authors. */
function anonymiseAuthors(xml: string): string {
  return xml
    .replace(/\bw:author="[^"]*"/g, 'w:author="Author"')
    .replace(/\bw:initials="[^"]*"/g, 'w:initials="A"')
    .replace(/\bw15:author="[^"]*"/g, 'w15:author="Author"')
    .replace(/\bw15:userId="[^"]*"/g, 'w15:userId="Author"');
}

/**
 * Returns the .docx with the author's name and organisation removed from its
 * properties, comments and tracked changes, or null if it can't be read as a
 * Word file (it is then uploaded unchanged and the server decides).
 */
export function stripDocxAuthor(bytes: Uint8Array): Uint8Array | null {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return null;
  }
  if (!entries["[Content_Types].xml"]) return null;
  const out: Zippable = {};
  for (const [path, data] of Object.entries(entries)) {
    const fields = XML_TEXT_FIELDS[path];
    if (fields) out[path] = strToU8(blankElements(strFromU8(data), fields));
    else if (/^word\/[^/]+\.xml$/.test(path)) out[path] = strToU8(anonymiseAuthors(strFromU8(data)));
    else out[path] = data;
  }
  // [Content_Types].xml first, as Word itself writes it.
  const ordered: Zippable = { "[Content_Types].xml": out["[Content_Types].xml"] };
  for (const [path, data] of Object.entries(out)) if (path !== "[Content_Types].xml") ordered[path] = data;
  return zipSync(ordered, { level: 6 });
}

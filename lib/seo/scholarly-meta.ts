// Google Scholar `citation_*` tags and Dublin Core fallbacks for an article
// page (section 11). Returned as ordered [name, content] pairs because order
// matters: each citation_author_institution must follow its citation_author.

import { scholarPublicationDate, type PublicationDate } from "@/lib/publication-date";

export interface Licence {
  /** e.g. "CC BY 4.0" */
  name: string;
  url: string | null;
}

export interface ScholarlyArticleMeta {
  title: string;
  authors: { fullName: string; affiliation: string | null; orcid: string | null }[];
  /** From articlePublicationDate(): the issue's date for back-catalogue uploads. */
  published: PublicationDate;
  year: number;
  journal: string;
  journalAbbrev: string;
  issn: string;
  publisher: string;
  volume: number;
  issue: number | null;
  firstPage: number | null;
  lastPage: number | null;
  doi: string | null;
  keywords: string[];
  abstract: string;
  /** Absolute URLs. */
  url: string;
  pdfUrl: string | null;
  /** The journal's licence from Settings; no rights statement when unset. */
  licence?: Licence | null;
}

export type MetaPair = readonly [name: string, content: string];

export function scholarTags(m: ScholarlyArticleMeta): MetaPair[] {
  const tags: MetaPair[] = [["citation_title", m.title]];
  for (const a of m.authors) {
    tags.push(["citation_author", a.fullName]);
    if (a.affiliation) tags.push(["citation_author_institution", a.affiliation]);
    if (a.orcid) tags.push(["citation_author_orcid", `https://orcid.org/${a.orcid}`]);
  }
  tags.push(
    ["citation_publication_date", scholarPublicationDate(m.published)],
    ["citation_journal_title", m.journal],
    ["citation_journal_abbrev", m.journalAbbrev],
    ["citation_issn", m.issn],
    ["citation_publisher", m.publisher],
    ["citation_volume", String(m.volume)],
  );
  if (m.issue != null) tags.push(["citation_issue", String(m.issue)]);
  if (m.firstPage != null) tags.push(["citation_firstpage", String(m.firstPage)]);
  if (m.lastPage != null) tags.push(["citation_lastpage", String(m.lastPage)]);
  if (m.doi) tags.push(["citation_doi", m.doi]);
  if (m.keywords.length > 0) tags.push(["citation_keywords", m.keywords.join("; ")]);
  tags.push(["citation_language", "en"], ["citation_abstract_html_url", m.url]);
  if (m.pdfUrl) tags.push(["citation_pdf_url", m.pdfUrl]);
  return tags;
}

export function dublinCoreTags(m: ScholarlyArticleMeta): MetaPair[] {
  const tags: MetaPair[] = [["DC.title", m.title]];
  for (const a of m.authors) tags.push(["DC.creator", a.fullName]);
  tags.push(
    ["DC.date", m.published.iso],
    ["DC.publisher", m.publisher],
    ["DC.identifier", m.doi ? `https://doi.org/${m.doi}` : m.url],
    ["DC.source", `${m.journal}, vol. ${m.volume}${m.issue != null ? `, no. ${m.issue}` : ""} (${m.year})`],
    ["DC.source.issn", m.issn],
    ["DC.language", "en"],
    ["DC.type", "Text"],
  );
  if (m.licence) {
    tags.push(["DC.rights", m.licence.url ? `${m.licence.name} (${m.licence.url})` : m.licence.name]);
  }
  for (const k of m.keywords) tags.push(["DC.subject", k]);
  if (m.abstract) tags.push(["DC.description", m.abstract.slice(0, 500)]);
  if (m.pdfUrl) tags.push(["DC.format", "application/pdf"]);
  return tags;
}

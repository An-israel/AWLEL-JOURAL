// schema.org structured data (section 11): Periodical on the home page,
// PublicationIssue / PublicationVolume on issue pages, ScholarlyArticle on
// article pages. Pure builders; <JsonLd> renders them.

export interface JournalLd {
  name: string;
  shortName: string;
  issn: string;
  publisher: string;
  url: string;
  description?: string;
  logoUrl?: string | null;
}

export interface IssueLd {
  volume: number;
  issue: number | null;
  year: number;
  label: string;
  url: string;
  datePublished: string | null;
  imageUrl?: string | null;
}

type Thing = Record<string, unknown>;

export function periodicalLd(j: JournalLd): Thing {
  return {
    "@type": "Periodical",
    "@id": `${j.url}/#periodical`,
    name: j.name,
    alternateName: j.shortName,
    issn: j.issn,
    url: j.url,
    inLanguage: "en",
    isAccessibleForFree: true,
    ...(j.description ? { description: j.description } : {}),
    publisher: {
      "@type": "Organization",
      name: j.publisher,
      ...(j.logoUrl ? { logo: j.logoUrl } : {}),
    },
  };
}

function volumeLd(j: JournalLd, i: IssueLd): Thing {
  return {
    "@type": "PublicationVolume",
    volumeNumber: String(i.volume),
    isPartOf: periodicalLd(j),
  };
}

export function issueLd(j: JournalLd, i: IssueLd, articles: { title: string; url: string }[] = []): Thing {
  // A volume with a single issue is published as the volume itself.
  const base: Thing =
    i.issue == null
      ? { ...volumeLd(j, i) }
      : { "@type": "PublicationIssue", issueNumber: String(i.issue), isPartOf: volumeLd(j, i) };
  return {
    ...base,
    "@id": `${i.url}#issue`,
    name: i.label,
    url: i.url,
    ...(i.datePublished ? { datePublished: i.datePublished.slice(0, 10) } : {}),
    ...(i.imageUrl ? { image: i.imageUrl } : {}),
    ...(articles.length > 0
      ? { hasPart: articles.map((a) => ({ "@type": "ScholarlyArticle", headline: a.title, url: a.url })) }
      : {}),
  };
}

export interface ArticleLd {
  title: string;
  url: string;
  abstract: string;
  keywords: string[];
  authors: { fullName: string; affiliation: string | null; orcid: string | null }[];
  datePublished: string | null;
  dateModified: string | null;
  firstPage: number | null;
  lastPage: number | null;
  doi: string | null;
  pdfUrl: string | null;
  imageUrl?: string;
  /** The licence's URL (preferred) or name, when one is set in Settings. */
  license?: string | null;
}

export function scholarlyArticleLd(j: JournalLd, i: IssueLd, a: ArticleLd): Thing {
  return {
    "@type": "ScholarlyArticle",
    "@id": `${a.url}#article`,
    headline: a.title.slice(0, 110),
    name: a.title,
    url: a.url,
    mainEntityOfPage: a.url,
    abstract: a.abstract,
    inLanguage: "en",
    isAccessibleForFree: true,
    ...(a.keywords.length > 0 ? { keywords: a.keywords.join(", ") } : {}),
    author: a.authors.map((p) => ({
      "@type": "Person",
      name: p.fullName,
      ...(p.affiliation ? { affiliation: { "@type": "Organization", name: p.affiliation } } : {}),
      ...(p.orcid ? { sameAs: `https://orcid.org/${p.orcid}` } : {}),
    })),
    ...(a.datePublished ? { datePublished: a.datePublished } : {}),
    ...(a.dateModified ? { dateModified: a.dateModified } : {}),
    ...(a.firstPage != null ? { pageStart: String(a.firstPage) } : {}),
    ...(a.lastPage != null ? { pageEnd: String(a.lastPage) } : {}),
    ...(a.firstPage != null && a.lastPage != null ? { pagination: `${a.firstPage}-${a.lastPage}` } : {}),
    ...(a.doi
      ? {
          identifier: { "@type": "PropertyValue", propertyID: "DOI", value: a.doi },
          sameAs: `https://doi.org/${a.doi}`,
        }
      : {}),
    ...(a.pdfUrl
      ? { encoding: { "@type": "MediaObject", encodingFormat: "application/pdf", contentUrl: a.pdfUrl } }
      : {}),
    ...(a.imageUrl ? { image: a.imageUrl } : {}),
    ...(a.license ? { license: a.license } : {}),
    publisher: { "@type": "Organization", name: j.publisher },
    isPartOf: issueLd(j, i),
  };
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in data. */
export function serializeJsonLd(thing: Thing): string {
  return JSON.stringify({ "@context": "https://schema.org", ...thing }).replace(/</g, "\\u003c");
}

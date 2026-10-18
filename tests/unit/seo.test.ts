import { describe, expect, it } from "vitest";
import { niceTicks } from "@/components/admin/metrics-chart";
import { isBot } from "@/lib/metrics/bots";
import { issueLd, periodicalLd, scholarlyArticleLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { dublinCoreTags, scholarTags, type ScholarlyArticleMeta } from "@/lib/seo/scholarly-meta";
import { fileNamePart } from "@/lib/file-names";

const meta: ScholarlyArticleMeta = {
  title: "Memory and Migration",
  authors: [
    {
      fullName: "Ngozi A. Okeke",
      affiliation: "University of Nigeria, Nsukka",
      orcid: "0000-0002-1825-0097",
    },
    { fullName: "Bola Adé", affiliation: null, orcid: null },
  ],
  published: { iso: "2025-06-30", precision: "day", year: 2025, month: 6 },
  year: 2025,
  journal: "African, World Literature and English Language",
  journalAbbrev: "AWLEL",
  issn: "2315-5493",
  publisher: "Department of English and Literary Studies, University of Nigeria, Nsukka",
  volume: 25,
  issue: 1,
  firstPage: 1,
  lastPage: 18,
  doi: "10.1234/awlel.25.1",
  keywords: ["memory", "migration"],
  abstract: "An abstract.",
  url: "https://awlel.org/articles/memory",
  pdfUrl: "https://awlel.org/api/download/article/x?format=pdf",
  docxUrl: null,
};

describe("Google Scholar tags", () => {
  const tags = scholarTags(meta);
  const names = tags.map(([n]) => n);

  it("has every tag the brief lists", () => {
    for (const name of [
      "citation_title",
      "citation_author",
      "citation_author_institution",
      "citation_publication_date",
      "citation_journal_title",
      "citation_issn",
      "citation_volume",
      "citation_issue",
      "citation_firstpage",
      "citation_lastpage",
      "citation_pdf_url",
      "citation_doi",
      "citation_keywords",
      "citation_publisher",
    ])
      expect(names).toContain(name);
  });

  it("puts each institution straight after its author, in author order", () => {
    const i = names.indexOf("citation_author");
    expect(tags[i]).toEqual(["citation_author", "Ngozi A. Okeke"]);
    expect(tags[i + 1]).toEqual(["citation_author_institution", "University of Nigeria, Nsukka"]);
    expect(tags.filter(([n]) => n === "citation_author").map(([, v]) => v)).toEqual([
      "Ngozi A. Okeke",
      "Bola Adé",
    ]);
  });

  it("uses Scholar's date format and leaves out what's missing", () => {
    expect(tags).toContainEqual(["citation_publication_date", "2025/06/30"]);
    const bare = scholarTags({
      ...meta,
      issue: null,
      doi: null,
      pdfUrl: null,
      firstPage: null,
      keywords: [],
    });
    const bareNames = bare.map(([n]) => n);
    for (const n of [
      "citation_issue",
      "citation_doi",
      "citation_pdf_url",
      "citation_firstpage",
      "citation_keywords",
    ])
      expect(bareNames).not.toContain(n);
  });

  it("adds Dublin Core fallbacks", () => {
    const dc = dublinCoreTags(meta);
    expect(dc.filter(([n]) => n === "DC.creator")).toHaveLength(2);
    expect(dc).toContainEqual(["DC.identifier", "https://doi.org/10.1234/awlel.25.1"]);
    expect(dc).toContainEqual(["DC.date", "2025-06-30"]);
  });

  it("dates a back-catalogue article by its issue", () => {
    const old = { ...meta, published: { iso: "2005-06", precision: "month", year: 2005, month: 6 } as const };
    expect(scholarTags(old)).toContainEqual(["citation_publication_date", "2005"]);
    expect(dublinCoreTags(old)).toContainEqual(["DC.date", "2005-06"]);
  });

  it("states rights only when a licence is set", () => {
    expect(dublinCoreTags(meta).map(([n]) => n)).not.toContain("DC.rights");
    expect(
      dublinCoreTags({
        ...meta,
        licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
      }),
    ).toContainEqual(["DC.rights", "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)"]);
  });
});

describe("JSON-LD", () => {
  const journal = {
    name: meta.journal,
    shortName: "AWLEL",
    issn: meta.issn,
    publisher: meta.publisher,
    url: "https://awlel.org",
  };
  const issue = {
    volume: 25,
    issue: 1,
    year: 2025,
    label: "Volume 25, Issue 1 (June 2025)",
    url: "https://awlel.org/issues/25/1",
    datePublished: "2025-06-30T08:00:00Z",
  };

  it("nests article → issue → volume → periodical", () => {
    const ld = scholarlyArticleLd(journal, issue, {
      title: meta.title,
      url: meta.url,
      abstract: "x",
      keywords: meta.keywords,
      authors: meta.authors,
      datePublished: meta.published.iso,
      dateModified: null,
      firstPage: 1,
      lastPage: 18,
      doi: meta.doi,
      pdfUrl: meta.pdfUrl,
      license: "https://creativecommons.org/licenses/by/4.0/",
    });
    expect(ld).toMatchObject({
      "@type": "ScholarlyArticle",
      datePublished: "2025-06-30",
      license: "https://creativecommons.org/licenses/by/4.0/",
      pagination: "1-18",
      author: [
        { name: "Ngozi A. Okeke", sameAs: "https://orcid.org/0000-0002-1825-0097" },
        { name: "Bola Adé" },
      ],
      isPartOf: {
        "@type": "PublicationIssue",
        issueNumber: "1",
        isPartOf: {
          "@type": "PublicationVolume",
          volumeNumber: "25",
          isPartOf: { "@type": "Periodical", issn: "2315-5493" },
        },
      },
    });
  });

  it("describes a single-issue volume as the volume itself", () => {
    expect(issueLd(journal, { ...issue, issue: null })["@type"]).toBe("PublicationVolume");
    expect(periodicalLd(journal)["@type"]).toBe("Periodical");
  });

  it("can't be broken out of its script element", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("analytics helpers", () => {
  it("drops bots and tools but keeps browsers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(
      isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0 Safari/537.36"),
    ).toBe(true);
    expect(isBot("curl/8.5.0")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(
      isBot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isBot(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("makes ASCII file-name parts", () => {
    expect(fileNamePart("Ọkafọ")).toBe("Okafo");
    expect(fileNamePart("Adébáyọ̀-Smith")).toBe("Adebayo-Smith");
    expect(fileNamePart("O'Neil")).toBe("ONeil");
    expect(fileNamePart("中文")).toBe("Article");
  });

  it("picks clean chart ticks", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });
});

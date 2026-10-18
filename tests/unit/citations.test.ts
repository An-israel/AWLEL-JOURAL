import { describe, expect, it } from "vitest";
import {
  apaAuthors,
  formatApa,
  formatBibtex,
  formatMla,
  formatRis,
  initials,
  mlaAuthors,
  parseName,
  type CitationInput,
} from "@/lib/citations";

const JOURNAL = "African, World Literature and English Language";

const base: CitationInput = {
  authors: [{ fullName: "Ngozi A. Okeke" }],
  title: "Memory, Migration and the Postcolonial Archive",
  journal: JOURNAL,
  year: 2025,
  volume: 25,
  issue: 1,
  firstPage: 1,
  lastPage: 18,
  url: "https://awlel.unn.edu.ng/articles/memory",
};

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ fullName: `Given${i + 1} Family${i + 1}` }));

describe("names", () => {
  it("splits on the last word", () => {
    expect(parseName("Ngozi A. Okeke")).toEqual({ family: "Okeke", given: "Ngozi A.", suffix: undefined });
  });
  it("honours 'Surname, Given'", () => {
    expect(parseName("Adimora-Ezeigbo, Akachi")).toEqual({ family: "Adimora-Ezeigbo", given: "Akachi" });
  });
  it("keeps suffixes out of the family name", () => {
    expect(parseName("Martin Luther King Jr.")).toMatchObject({ family: "King", suffix: "Jr." });
  });
  it("builds initials, including hyphenated names", () => {
    expect(initials("Ngozi Adaeze")).toBe("N. A.");
    expect(initials("Jean-Paul")).toBe("J.-P.");
    expect(initials("T. M. E.")).toBe("T. M. E.");
  });
});

describe("APA 7th", () => {
  it("formats a single author", () => {
    expect(formatApa(base).plain).toBe(
      `Okeke, N. A. (2025). Memory, Migration and the Postcolonial Archive. ${JOURNAL}, 25(1), 1–18. https://awlel.unn.edu.ng/articles/memory`,
    );
  });

  it("uses & before the second of two authors", () => {
    expect(apaAuthors([{ fullName: "Chukwuemeka J. Eze" }, { fullName: "Amaka P. Nwosu" }])).toBe(
      "Eze, C. J., & Nwosu, A. P.",
    );
  });

  it("lists three to twenty authors with & before the last", () => {
    expect(apaAuthors(people(3))).toBe("Family1, G., Family2, G., & Family3, G.");
    const twenty = apaAuthors(people(20));
    expect(twenty.split(", & ")).toHaveLength(2);
    expect(twenty).toContain("Family19, G., & Family20, G.");
  });

  it("uses an ellipsis after 19 authors when there are more than 20", () => {
    const list = apaAuthors(people(23));
    expect(list).toContain("Family19, G., . . . Family23, G.");
    expect(list).not.toContain("Family20");
    expect(list).not.toContain("&");
  });

  it("italicises the journal and volume, not the issue", () => {
    const { segments, html } = formatApa(base);
    expect(segments.filter((s) => s.italic).map((s) => s.text)).toEqual([JOURNAL, "25"]);
    expect(html).toContain(`<i>${JOURNAL}</i>, <i>25</i>(1)`);
  });

  it("ends with the DOI as a URL when there is one, and omits the issue for single-issue volumes", () => {
    const apa = formatApa({ ...base, issue: null, doi: "10.1234/awlel.2025.1" }).plain;
    expect(apa).toMatch(new RegExp(`${JOURNAL}, 25, 1–18\\. https://doi\\.org/10\\.1234/awlel\\.2025\\.1$`));
    expect(apa).not.toContain(base.url);
  });

  it("ends with the article's own URL, without a full stop, when there is no DOI", () => {
    const apa = formatApa(base).plain;
    expect(apa).not.toContain("doi.org");
    expect(apa.endsWith("1–18. https://awlel.unn.edu.ng/articles/memory")).toBe(true);
  });

  it("does not double the full stop after a title ending in a question mark", () => {
    expect(formatApa({ ...base, title: "Who Speaks for Africa?" }).plain).toContain(
      "Who Speaks for Africa? ",
    );
  });
});

describe("MLA 8th", () => {
  it("formats a single author", () => {
    expect(formatMla(base).plain).toBe(
      `Okeke, Ngozi A. “Memory, Migration and the Postcolonial Archive.” ${JOURNAL}, vol. 25, no. 1, 2025, pp. 1–18. awlel.unn.edu.ng/articles/memory.`,
    );
  });

  it("joins two authors with 'and', second name in natural order", () => {
    expect(mlaAuthors([{ fullName: "Chukwuemeka J. Eze" }, { fullName: "Amaka P. Nwosu" }])).toBe(
      "Eze, Chukwuemeka J., and Amaka P. Nwosu",
    );
  });

  it("uses et al. for three or more authors", () => {
    const mla = formatMla({ ...base, authors: people(3) }).plain;
    expect(mla.startsWith("Family1, Given1, et al. “")).toBe(true);
  });

  it("italicises only the journal title", () => {
    expect(
      formatMla(base)
        .segments.filter((s) => s.italic)
        .map((s) => s.text),
    ).toEqual([JOURNAL]);
  });

  it("uses p. for a single page and adds a DOI", () => {
    const mla = formatMla({ ...base, lastPage: 1, doi: "10.1234/x" }).plain;
    expect(mla).toContain("2025, p. 1. doi:10.1234/x.");
    expect(mla).not.toContain("awlel.unn.edu.ng");
  });
});

describe("exports", () => {
  it("produces BibTeX with escaped characters and a stable key", () => {
    const bib = formatBibtex({ ...base, title: "Love & Money in 100% Lagos" });
    expect(bib).toMatch(/^@article\{okeke2025love,/);
    expect(bib).toContain("title = {{Love \\& Money in 100\\% Lagos}}");
    expect(bib).toContain("pages = {1--18}");
    expect(bib).toContain("author = {Okeke, Ngozi A.}");
  });

  it("produces RIS with CRLF line endings and one AU line per author", () => {
    const ris = formatRis({ ...base, authors: people(2), keywords: ["memory", "archive"] });
    expect(ris.startsWith("TY  - JOUR\r\n")).toBe(true);
    expect(ris.match(/^AU {2}- /gm)).toHaveLength(2);
    expect(ris).toContain("KW  - archive\r\n");
    expect(ris.endsWith("ER  - \r\n")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { matchFileToRow, type MatchableRow } from "@/lib/admin/bulk-match";
import { parseCsv } from "@/lib/admin/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    const csv =
      '﻿Title,Authors,Abstract\r\n"Love, Loss","A. Okeke; B. Eze","He said ""no"".\nThen left."\r\nSecond,C. Obi,\r\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["title", "authors", "abstract"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: "Love, Loss",
      authors: "A. Okeke; B. Eze",
      abstract: 'He said "no".\nThen left.',
    });
    expect(rows[1].abstract).toBe("");
  });
});

describe("matchFileToRow", () => {
  const rows: MatchableRow[] = [
    {
      key: "r1",
      title: "Memory and Migration in Nigerian Fiction",
      authors: ["Ngozi A. Okeke"],
      firstPage: 1,
    },
    {
      key: "r2",
      title: "Code-Switching on Nigerian Campuses",
      authors: ["Chukwuemeka Eze", "Amaka Nwosu"],
      firstPage: 19,
    },
    {
      key: "r3",
      title: "Ritual and Satire",
      authors: ["Tunde Adebayo"],
      firstPage: 37,
      pdfFileName: "article-3-final.pdf",
    },
  ];

  it("prefers an exact file name from the CSV", () => {
    expect(matchFileToRow("Article-3-FINAL.pdf", rows)).toBe("r3");
  });
  it("matches on surname and page number", () => {
    expect(matchFileToRow("AWLEL_Vol25_Okeke_2025.pdf", rows)).toBe("r1");
    expect(matchFileToRow("19-36 Eze code switching.docx", rows)).toBe("r2");
  });
  it("returns null when unsure", () => {
    expect(matchFileToRow("scan001.pdf", rows)).toBeNull();
    expect(matchFileToRow("nigerian.pdf", rows)).toBeNull();
  });
});

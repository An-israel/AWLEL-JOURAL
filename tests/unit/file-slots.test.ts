import { describe, expect, it } from "vitest";
import { checkFile, MIME, safeFileName } from "@/lib/admin/file-slots";

describe("checkFile", () => {
  it("accepts a PDF for an article PDF slot", () => {
    expect(checkFile("article_pdf", { name: "Okeke.pdf", type: MIME.pdf, size: 1000 })).toBeNull();
  });
  it("rejects wrong extensions, wrong types, empty and oversized files", () => {
    expect(checkFile("article_pdf", { name: "Okeke.docx", type: MIME.docx, size: 1000 })).toMatch(/must be/);
    expect(checkFile("article_docx", { name: "x.docx", type: "application/zip", size: 1000 })).toMatch(
      /accepted file type/,
    );
    expect(checkFile("issue_cover", { name: "c.png", type: MIME.png, size: 0 })).toMatch(/empty/);
    expect(checkFile("issue_cover", { name: "c.png", type: MIME.png, size: 11 * 1024 * 1024 })).toMatch(
      /larger than 10 MB/,
    );
  });
  it("keeps published files within the 50 MB Supabase Free accepts", () => {
    const big = { name: "Vol25_Issue1.pdf", type: MIME.pdf, size: 51 * 1024 * 1024 };
    expect(checkFile("issue_pdf", big)).toMatch(/larger than 50 MB/);
    expect(checkFile("article_pdf", big)).toMatch(/larger than 50 MB/);
    expect(checkFile("issue_pdf", { ...big, size: 49 * 1024 * 1024 })).toBeNull();
  });
});

describe("safeFileName", () => {
  it("keeps names readable and storage-safe", () => {
    expect(safeFileName("Vol 25 Issue 1 — Ọkéké (final).PDF")).toBe("Vol_25_Issue_1_Okeke_final_.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
  });
});

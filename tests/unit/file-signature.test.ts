import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIME } from "@/lib/admin/file-slots";
import { signatureMatches } from "@/lib/file-signature";

const head = (path: string) => new Uint8Array(readFileSync(path).subarray(0, 64));
const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16).fill(0)]);
const text = (s: string) => new TextEncoder().encode(s.padEnd(16, " "));

describe("file signatures", () => {
  it("accept real PDF and Word files", () => {
    expect(signatureMatches(MIME.pdf, head("tests/e2e/fixtures/Testauthor_article.pdf"))).toBe(true);
    expect(signatureMatches(MIME.docx, head("tests/e2e/fixtures/Okafor_bulk.docx"))).toBe(true);
  });

  it("reject a file whose content doesn't match its type", () => {
    expect(signatureMatches(MIME.pdf, head("tests/e2e/fixtures/Okafor_bulk.docx"))).toBe(false);
    expect(signatureMatches(MIME.docx, head("tests/e2e/fixtures/Testauthor_article.pdf"))).toBe(false);
    expect(signatureMatches(MIME.pdf, text("<html><script>alert(1)</script>"))).toBe(false);
    expect(signatureMatches(MIME.pdf, bytes(0x4d, 0x5a))).toBe(false); // a Windows .exe
    expect(signatureMatches("text/html", text("%PDF-1.4"))).toBe(false); // unknown types never pass
  });

  it("recognise the image types", () => {
    expect(signatureMatches(MIME.jpeg, bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(signatureMatches(MIME.png, bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(signatureMatches(MIME.webp, text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe(true);
    expect(signatureMatches(MIME.svg, text('<?xml version="1.0"?><svg'))).toBe(true);
    expect(signatureMatches(MIME.svg, text("<svg xmlns='x'>"))).toBe(true);
    expect(signatureMatches(MIME.png, bytes(0xff, 0xd8, 0xff))).toBe(false);
  });
});

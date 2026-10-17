// File signatures ("magic bytes", item 79/section 15): the first bytes of an
// upload must match its declared type, so a renamed executable or HTML page
// can't be stored as a "PDF". Pure, so it is unit tested.

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

/** True when `head` (the file's first bytes, at least 12) fits the MIME type. */
export function signatureMatches(mime: string, head: Uint8Array): boolean {
  switch (mime) {
    case "application/pdf":
      return ascii(head, 0, 5) === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      // .docx is a ZIP archive.
      return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return ascii(head, 1, 4) === "PNG" && head[0] === 0x89;
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";
    case "image/svg+xml": {
      const text = new TextDecoder().decode(head).replace(/^﻿/, "").trimStart().toLowerCase();
      return text.startsWith("<svg") || text.startsWith("<?xml");
    }
    default:
      return false;
  }
}

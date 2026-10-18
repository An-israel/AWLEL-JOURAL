import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MIME } from "@/lib/admin/file-slots";
import { signatureMatches } from "@/lib/file-signature";
import { canMoveTo, fileRoleLabel, NEXT_STATUSES, SUBMISSION_STATUSES } from "@/lib/submission-status";
import { stripDocxAuthor } from "@/lib/submissions/docx-metadata";
import { noteEmail, revisionReminderEmail, statusEmail } from "@/lib/submissions/emails";
import { checkSubmissionFile, submissionMimeOf } from "@/lib/submissions/file-rules";

describe("submission file types (items 48, 49)", () => {
  it("accepts Word and PDF files whatever the device reports, by extension", () => {
    for (const type of [MIME.docx, "", "application/octet-stream"]) {
      expect(submissionMimeOf({ name: "Paper.docx", type })).toBe(MIME.docx);
      expect(checkSubmissionFile({ name: "Paper.docx", type, size: 100 }, true)).toBeNull();
    }
    expect(submissionMimeOf({ name: "copy.pdf", type: "" })).toBe(MIME.pdf);
    expect(submissionMimeOf({ name: "copy.pdf", type: "application/octet-stream" })).toBe(MIME.pdf);
  });

  it("accepts an upper-case .DOCX", () => {
    expect(checkSubmissionFile({ name: "PAPER.DOCX", type: MIME.docx, size: 100 }, true)).toBeNull();
  });

  it("still refuses other files and mismatched types", () => {
    expect(submissionMimeOf({ name: "paper.doc", type: "application/msword" })).toBeNull();
    expect(submissionMimeOf({ name: "paper.docx", type: "text/html" })).toBeNull();
    expect(submissionMimeOf({ name: "paper.docx", type: MIME.pdf })).toBeNull();
    expect(checkSubmissionFile({ name: "copy.pdf", type: "", size: 100 }, true)).toMatch(/Word document/);
    expect(checkSubmissionFile({ name: "x.exe", type: "", size: 100 })).toMatch(/must be a Word/);
    expect(checkSubmissionFile({ name: "x.docx", type: "", size: 0 })).toMatch(/empty/);
  });
});

describe("status transitions (item 56)", () => {
  // The same table as submission_transition_allowed() in
  // supabase/migrations/20261018000016_workflow_fixes.sql.
  const SQL_TABLE: Record<string, string[]> = {
    submitted: ["under_screening", "under_review", "rejected", "withdrawn"],
    under_screening: ["under_review", "revisions_requested", "rejected", "withdrawn"],
    under_review: ["revisions_requested", "accepted", "rejected", "withdrawn"],
    revisions_requested: ["revision_received", "under_review", "rejected", "withdrawn"],
    revision_received: ["under_review", "revisions_requested", "accepted", "rejected", "withdrawn"],
    accepted: ["published", "withdrawn"],
    rejected: ["under_review"],
    published: [],
    withdrawn: [],
  };

  it("match the database's rules", () => {
    for (const from of SUBMISSION_STATUSES)
      expect([...NEXT_STATUSES[from]].sort()).toEqual(SQL_TABLE[from].sort());
  });

  it("keep withdrawn and published final and never jump straight to published", () => {
    expect(SUBMISSION_STATUSES.some((s) => canMoveTo("withdrawn", s))).toBe(false);
    expect(SUBMISSION_STATUSES.some((s) => canMoveTo("published", s))).toBe(false);
    expect(canMoveTo("submitted", "published")).toBe(false);
    expect(canMoveTo("rejected", "submitted")).toBe(false);
    expect(canMoveTo("rejected", "under_review")).toBe(true);
  });
});

describe("file labels (item 64)", () => {
  it("name files by their role", () => {
    expect(fileRoleLabel({ kind: "original", version: 1, isPdf: false })).toBe("Word manuscript");
    expect(fileRoleLabel({ kind: "original", version: 2, isPdf: true })).toBe("PDF copy");
    expect(fileRoleLabel({ kind: "revision", version: 2, isPdf: false })).toBe("Revised manuscript v2");
    expect(fileRoleLabel({ kind: "reviewer_annotated", version: 1, isPdf: true })).toBe(
      "Reviewer's marked-up file",
    );
  });
});

describe("author emails (item 66)", () => {
  const base = {
    title: "Silence and Speech",
    authorName: "Ada Okafor",
    link: "https://x/account/submissions/1",
  };

  it("put the editors' message first, then the decision, then a blank line and the help text", () => {
    const { subject, text } = statusEmail({ ...base, status: "accepted", message: "Lovely work." });
    expect(subject).toBe("Accepted for publication: Silence and Speech");
    expect(text.startsWith("Dear Ada Okafor,\n\nLovely work.\n\nWe are delighted")).toBe(true);
    expect(text).toMatch(/\n\nYou can see the full history/);
    expect(
      text.trimEnd().endsWith("The Editors, AWLEL\nAfrican, World Literature and English Language"),
    ).toBe(true);
  });

  it("write a courteous, final rejection that encourages future work", () => {
    const { text } = statusEmail({ ...base, status: "rejected", message: null });
    expect(text).toMatch(/Thank you for submitting/);
    expect(text).toMatch(/final for this manuscript/);
    expect(text).toMatch(/encourage you to submit future work/);
  });

  it("say what to do next and by when for revisions", () => {
    const { text } = statusEmail({
      ...base,
      status: "revisions_requested",
      message: null,
      revisionDueDate: "2026-11-15",
    });
    expect(text).toMatch(/What to do next/);
    expect(text).toMatch(/response to the reviewers/);
    expect(text).toMatch(/by 15 November 2026/);
  });

  it("link to the published article", () => {
    const { text } = statusEmail({
      ...base,
      status: "published",
      message: null,
      articleUrl: "https://x/articles/silence",
    });
    expect(text).toMatch(/https:\/\/x\/articles\/silence/);
  });

  it("send notes and overdue reminders with the same courtesy", () => {
    expect(noteEmail({ ...base, message: "We have two reviewers." }).text).toMatch(
      /added a note about your manuscript “Silence and Speech”:\n\nWe have two reviewers\./,
    );
    expect(revisionReminderEmail({ ...base, dueDate: "2026-10-01" }).text).toMatch(
      /was due on 1 October 2026/,
    );
  });
});

describe("removing the author's name from a .docx (item 54)", () => {
  const docx = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "docProps/core.xml": strToU8(
      "<cp:coreProperties><dc:title>Silence</dc:title><dc:creator>Ada Okafor</dc:creator><cp:lastModifiedBy>Ada Okafor</cp:lastModifiedBy></cp:coreProperties>",
    ),
    "docProps/app.xml": strToU8(
      "<Properties><Company>University of Nigeria</Company><Manager>Prof. X</Manager></Properties>",
    ),
    "word/comments.xml": strToU8(
      '<w:comments><w:comment w:id="0" w:author="Ada Okafor" w:initials="AO"/></w:comments>',
    ),
    "word/document.xml": strToU8("<w:document>Body text</w:document>"),
  });

  it("clears creator, last editor, company, manager and comment authors", () => {
    const out = stripDocxAuthor(docx)!;
    const files = unzipSync(out);
    const all = Object.values(files)
      .map((f) => strFromU8(f))
      .join("\n");
    expect(all).not.toMatch(/Okafor|University of Nigeria|Prof\. X|"AO"/);
    expect(strFromU8(files["docProps/core.xml"])).toContain("<dc:title>Silence</dc:title>");
    expect(strFromU8(files["word/document.xml"])).toBe("<w:document>Body text</w:document>");
  });

  it("still passes the server's magic-byte check", () => {
    expect(signatureMatches(MIME.docx, stripDocxAuthor(docx)!.slice(0, 16))).toBe(true);
  });

  it("leaves files it can't read alone", () => {
    expect(stripDocxAuthor(strToU8("not a zip"))).toBeNull();
  });
});

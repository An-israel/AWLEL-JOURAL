import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, createUser, resetRateLimits, signInAndWait as signIn, TEST_PASSWORD } from "./helpers";

// Unfinished submissions, revisions with a response to the reviewers, and
// withdrawal (items 51, 52, 53). Serial: each step builds on the one before.
test.describe.configure({ mode: "serial" });

const run = Date.now();
const title = `Orality and Archive ${run}`;
let author: { id: string; email: string };
let editor: { id: string; email: string };
let submissionId = "";

const ABSTRACT =
  "This article reads oral performance as an archive in its own right, following three griots whose recitations preserve histories that written records left out, and asks what it means to cite them.";

test.beforeAll(async () => {
  author = await createUser("author", "aw-author");
  editor = await createUser("editor", "aw-editor");
  const { data: category } = await adminClient().from("categories").select("id").limit(1).single();
  // Details saved, but the manuscript never arrived: "not finished".
  const { data, error } = await adminClient()
    .from("submissions")
    .insert({
      author_id: author.id,
      title,
      abstract: `<p>${ABSTRACT}</p>`,
      keywords: ["orality", "archive", "griot"],
      category_id: category?.id,
      citation_style: "mla8",
      idempotency_key: randomUUID(),
    })
    .select("id")
    .single();
  if (error) throw error;
  submissionId = data.id;
  await adminClient()
    .from("submission_authors")
    .insert({ submission_id: submissionId, full_name: "E2E aw-author", position: 0, is_corresponding: true });
});

test.beforeEach(async () => {
  await resetRateLimits();
});

test("an unfinished submission says so, stays out of the editors' queue, and can be finished", async ({
  browser,
}) => {
  const editorPage = await browser.newPage();
  await signIn(editorPage, editor.email, TEST_PASSWORD);
  await editorPage.goto("/admin/submissions");
  await expect(editorPage.getByRole("link", { name: title })).toHaveCount(0);
  await editorPage.goto("/admin/submissions?status=unfinished");
  await expect(editorPage.getByRole("link", { name: title })).toBeVisible();
  await editorPage.close();

  const page = await browser.newPage();
  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto("/account/submissions");
  await expect(page.getByText("Not finished — upload your manuscript to submit it")).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: "Not finished — upload your manuscript" })).toBeVisible();
  await page.getByLabel("Manuscript (.docx)").setInputFiles("tests/e2e/fixtures/Okafor_bulk.docx");
  await page.getByRole("button", { name: "Upload and submit" }).click();
  await expect(page.getByText("Your manuscript has been submitted.")).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

  const { data } = await adminClient()
    .from("submissions")
    .select("finalised_at")
    .eq("id", submissionId)
    .single();
  expect(data?.finalised_at).not.toBeNull();
  await page.close();
});

test("the author can edit details while the submission is still Submitted", async ({ page }) => {
  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto(`/account/submissions/${submissionId}`);
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Keywords", { exact: true }).fill("orality, archive, griot, performance");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
});

test("the author answers a revision request with a response to the reviewers", async ({ page }) => {
  // The editors screen it and ask for revisions (valid steps only).
  const db = adminClient();
  await db.from("submissions").update({ status: "under_screening" }).eq("id", submissionId);
  await db
    .from("submissions")
    .update({ status: "revisions_requested", revision_due_date: "2099-01-31" })
    .eq("id", submissionId);

  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto(`/account/submissions/${submissionId}`);
  await expect(page.getByText("Please send it by 31 January 2099.")).toBeVisible();
  await page.getByLabel("Revised manuscript").setInputFiles("tests/e2e/fixtures/Okafor_bulk.docx");
  await page.getByRole("button", { name: "Send revised manuscript" }).click();
  await expect(page.getByText(/what you changed/).last()).toBeVisible();
  await page
    .getByLabel("Response to the reviewers")
    .fill("I have rewritten section two to engage the recent work on testimony, as Reviewer 1 suggested.");
  await page.getByRole("button", { name: "Send revised manuscript" }).click();
  await expect(page.getByText("Revised manuscript sent to the editors.")).toBeVisible();
  await expect(page.getByText("Revision received", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send revised manuscript" })).toHaveCount(0);
});

test("editors see the response; the author can withdraw", async ({ browser }) => {
  const editorPage = await browser.newPage();
  await signIn(editorPage, editor.email, TEST_PASSWORD);
  await editorPage.goto(`/admin/submissions/${submissionId}`);
  await expect(editorPage.getByText("Author’s response to the reviewers")).toBeVisible();
  await expect(editorPage.getByText(/rewritten section two/)).toBeVisible();
  await expect(editorPage.getByText("Revised manuscript v1").first()).toBeVisible();
  await editorPage.close();

  const page = await browser.newPage();
  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto(`/account/submissions/${submissionId}`);
  await page.getByRole("button", { name: "Withdraw submission" }).click();
  await page.getByLabel("Reason (optional)").fill("It has been accepted elsewhere.");
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("Your submission has been withdrawn.")).toBeVisible();
  await expect(page.getByText(/Reason: It has been accepted elsewhere\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw submission" })).toHaveCount(0);
  await page.close();
});

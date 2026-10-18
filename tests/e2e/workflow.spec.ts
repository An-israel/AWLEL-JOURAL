import { expect, test } from "@playwright/test";
import { adminClient, createUser, resetRateLimits, signInAndWait as signIn, TEST_PASSWORD } from "./helpers";

// One manuscript through the whole workflow (section 7). Serial: each step
// depends on the one before.
test.describe.configure({ mode: "serial" });

const run = Date.now();
const title = `Silence and Speech in the Postcolonial Novel ${run}`;
const authorName = `Ada Secretname ${run}`;
let author: { id: string; email: string };
let editor: { id: string; email: string };
let reviewer: { id: string; email: string };
let submissionId = "";

test.beforeAll(async () => {
  author = await createUser("author", "wf-author");
  editor = await createUser("editor", "wf-editor");
  reviewer = await createUser("reviewer", "wf-reviewer");
  await adminClient().from("profiles").update({ full_name: authorName }).eq("id", author.id);
  await adminClient()
    .from("profiles")
    .update({ full_name: `Rita Reviewer ${run}` })
    .eq("id", reviewer.id);
});

test.beforeEach(async () => {
  await resetRateLimits();
});

test("author submits a manuscript", async ({ page }) => {
  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto("/submit");
  await page.getByRole("button", { name: "Submit manuscript" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please check the highlighted fields." }),
  ).toBeVisible();
  await expect(page.getByText("Attach your manuscript as a Word document (.docx).")).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Abstract", { exact: true })
    .fill(
      "This article reads silence as a form of speech in postcolonial fiction. It argues that withheld narration records histories that official archives exclude, and that readers are asked to complete them.",
    );
  await page.getByLabel("Keywords", { exact: true }).fill("silence, speech, postcolonial novel");
  await page.getByLabel("Subject area", { exact: true }).selectOption({ label: "African Literature" });
  await page.getByLabel("MLA 8th edition (Works Cited)").check();
  await page.getByLabel("Your institution", { exact: true }).fill("University of Nigeria, Nsukka");
  await page.getByRole("button", { name: "Add a co-author" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Bola Coauthor ${run}`);
  await page.getByLabel("Manuscript (.docx, required)").setInputFiles("tests/e2e/fixtures/Okafor_bulk.docx");
  for (const d of [
    "original work",
    "not published or under review",
    "follows the AWLEL submission guidelines",
  ]) {
    await page.getByLabel(new RegExp(d)).check();
  }
  await page.getByRole("button", { name: "Submit manuscript" }).click();

  await expect(page).toHaveURL(/\/account\/submissions\/[0-9a-f-]{36}\?submitted=1$/, { timeout: 20_000 });
  await expect(page.getByText("your manuscript has been submitted")).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  submissionId = page.url().split("/").pop()!.split("?")[0];

  const db = adminClient();
  const { data: files } = await db.from("submission_files").select("kind").eq("submission_id", submissionId);
  expect(files).toEqual([{ kind: "original" }]);
  const { data: jobs } = await db
    .from("jobs")
    .select("status")
    .like("idempotency_key", `submission-received%:${submissionId}`);
  expect(jobs).toHaveLength(2);
});

test("editor screens it and assigns a reviewer", async ({ page }) => {
  await signIn(page, editor.email, TEST_PASSWORD);
  await page.goto(`/admin/submissions/${submissionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText(authorName).first()).toBeVisible();

  // Only valid next statuses are offered (item 56).
  const options = await page.getByLabel("New status").locator("option").allTextContents();
  expect(options).not.toContain("Published");
  expect(options).not.toContain("Accepted");

  // A note without a status change is saved and emailed with its own key (item 55).
  await page.getByLabel("Note", { exact: true }).fill("Thank you. We are reading your manuscript now.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Note added to the author's timeline and emailed to them.")).toBeVisible();
  const { data: notes } = await adminClient()
    .from("submission_events")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("message", "Thank you. We are reading your manuscript now.");
  expect(notes).toHaveLength(1);
  const { data: noteJobs } = await adminClient()
    .from("jobs")
    .select("id")
    .eq("idempotency_key", `note:${notes![0].id}`);
  expect(noteJobs).toHaveLength(1);

  await page.getByLabel("New status").selectOption("under_review");
  await page
    .getByLabel("Message to the author (optional)")
    .fill("Your manuscript has been sent for peer review.");
  await page.getByRole("button", { name: "Change to Under review" }).click();
  await expect(page.getByText("Status changed and the author has been emailed.")).toBeVisible();

  await page.getByLabel("Assign a reviewer").selectOption({ label: `Rita Reviewer ${run} · Reviewer` });
  await page.getByLabel("Due date").fill("2099-01-31");
  await page.getByRole("button", { name: "Assign and email invitation" }).click();
  await expect(page.getByText(`Rita Reviewer ${run} has been invited to review.`)).toBeVisible();
});

test("reviewer sees a blinded manuscript and submits a review", async ({ page }) => {
  await signIn(page, reviewer.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByText("Blind review.")).toBeVisible();
  // Blinding: nothing on the page names the author or co-author.
  const body = await page.getByRole("main").innerText();
  expect(body).not.toContain("Secretname");
  expect(body).not.toContain("Coauthor");
  // Accept the invitation first (item 60).
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByText("Thank you for agreeing to review.")).toBeVisible();
  // The manuscript downloads under a neutral name.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Manuscript_[0-9a-f]{8}_v1\.docx$/);

  await page.getByLabel("Minor revisions").check();
  await page.locator("#rc-comments").click();
  await page.keyboard.type(
    "A persuasive argument. The theoretical framework section should engage more recent work on silence and testimony.",
  );
  await page
    .getByLabel("Confidential comments to the editors (optional)")
    .fill("Confidential: the argument overlaps with an earlier conference paper.");
  await page.getByRole("button", { name: "Submit review" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Review submitted. Thank you!")).toBeVisible();
  await expect(page.getByText("Your review")).toBeVisible();
});

test("editor shares the review with the author, anonymously", async ({ page }) => {
  await signIn(page, editor.email, TEST_PASSWORD);
  await page.goto(`/admin/submissions/${submissionId}`);
  await expect(page.getByText("Confidential, for the editors only")).toBeVisible();
  await expect(page.getByText(/overlaps with an earlier conference paper/)).toBeVisible();
  await page.getByRole("button", { name: "Share with the author" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Share" }).click();
  await expect(page.getByText(/The comments are on the author's timeline/)).toBeVisible();
});

test("author sees progress but never the reviewer", async ({ page }) => {
  await signIn(page, author.email, TEST_PASSWORD);
  await page.goto(`/account/submissions/${submissionId}`);
  await expect(page.getByText("Your manuscript has been sent for peer review.")).toBeVisible();
  await expect(page.getByText("Thank you. We are reading your manuscript now.")).toBeVisible();
  await expect(page.getByText(/Comments from Reviewer 1 \(review round 1\)/)).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).not.toContainText("Rita Reviewer");
  await expect(main).not.toContainText("conference paper");
});

test("editor reads the review, accepts and creates the article", async ({ page }) => {
  await signIn(page, editor.email, TEST_PASSWORD);
  await page.goto(`/admin/submissions/${submissionId}`);
  await expect(page.getByText("Reviews received (1)")).toBeVisible();
  await expect(page.getByText(/theoretical framework section should engage/)).toBeVisible();

  await page.getByLabel("New status").selectOption("accepted");
  await page.getByRole("button", { name: "Change to Accepted" }).click();
  await expect(page.getByText("Status changed and the author has been emailed.")).toBeVisible();

  await page.getByLabel("Issue", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create draft article" }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue(authorName);

  // Clean up the draft so public pages are unaffected.
  const articleId = page.url().split("/").pop()!;
  await adminClient().from("submissions").update({ article_id: null }).eq("id", submissionId);
  await adminClient().from("articles").delete().eq("id", articleId);
});

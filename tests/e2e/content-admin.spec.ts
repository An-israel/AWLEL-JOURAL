import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createUser, resetRateLimits, signIn, SUPER_ADMIN, TEST_PASSWORD } from "./helpers";

const fixture = (name: string) => `tests/e2e/fixtures/${name}`;
const TEST_YEAR = 2099;

/** Removes everything these tests create, so the public tests and re-runs see the seed data. */
test.afterAll(async ({ browser }) => {
  const db = adminClient();
  const { data: volumes } = await db.from("volumes").select("id").eq("year", TEST_YEAR);
  const volumeIds = (volumes ?? []).map((v) => v.id);
  if (volumeIds.length) {
    const { data: issues } = await db.from("issues").select("id").in("volume_id", volumeIds);
    const issueIds = (issues ?? []).map((i) => i.id);
    if (issueIds.length) {
      await db.from("articles").delete().in("issue_id", issueIds);
      await db.from("issues").delete().in("id", issueIds);
    }
    await db.from("volumes").delete().in("id", volumeIds);
  }
  await db.from("categories").delete().like("name", "Test Category %");
  await db.from("feature_flags").update({ enabled: true }).eq("key", "home_most_read");

  // Deleting rows directly doesn't expire the site's cached pages, so save the
  // category order once through the admin: that expires the issue, article and
  // category caches the public tests read.
  await resetRateLimits();
  const page = await browser.newPage();
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.waitForURL(/\/admin$/);
  await page.goto("/admin/categories");
  await page
    .getByRole("button", { name: /Move .* down/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Move .* up/ })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText("Order saved.")).toBeVisible();
  await page.close();
});

/** A fresh volume number per run, so tests never collide with earlier data. */
function freshVolume() {
  return 500 + Math.floor(Math.random() * 9000);
}

async function newDraftIssue(page: Page, volume: number) {
  await page.goto("/admin/issues");
  await page.getByRole("button", { name: "New volume" }).click();
  await page.getByLabel("Volume number").fill(String(volume));
  await page.getByLabel("Year").fill(String(TEST_YEAR));
  await page.getByRole("button", { name: "Create volume" }).click();
  await expect(page.getByText(`Volume ${volume} created.`)).toBeVisible();
  const card = page.locator("div.rounded-lg", { has: page.getByText(`Volume ${volume}`, { exact: true }) });
  await card.getByRole("button", { name: "Add issue" }).click();
  await page.getByRole("button", { name: "Create draft issue" }).click();
  await expect(page).toHaveURL(/\/admin\/issues\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test.describe("editor content workflows", () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    const editor = await createUser("editor", "content");
    await signIn(page, editor.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("editor creates, uploads and publishes an article", async ({ page }) => {
    const volume = freshVolume();
    const issueId = await newDraftIssue(page, volume);

    await page.getByRole("link", { name: "New article" }).click();
    await expect(page.getByLabel("Issue", { exact: true })).toHaveValue(issueId);
    const title = `Testing the Archive ${volume}`;
    await page.getByLabel("Title", { exact: true }).fill(title);
    await expect(page.getByLabel("URL slug")).toHaveValue(`testing-the-archive-${volume}`);
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "African Literature" });
    await page.getByLabel("First page").fill("1");
    await page.getByLabel("Last page").fill("12");
    await page.getByLabel("Keywords", { exact: true }).fill("archive, testing");
    await page.locator("#a-abstract").click();
    await page.keyboard.type("An abstract written in the rich text editor.");
    await page.getByLabel("Name", { exact: true }).fill("Ada Testauthor");
    await page.getByLabel("Affiliation", { exact: true }).fill("University of Nigeria, Nsukka");
    await page.getByRole("button", { name: "Create draft article" }).click();
    await expect(page).toHaveURL(/\/admin\/articles\/[0-9a-f-]{36}$/);

    // Upload the PDF straight to storage through a signed URL.
    await page.getByLabel("Choose article pdf").setInputFiles(fixture("Testauthor_article.pdf"));
    await expect(page.getByText("Article PDF uploaded.")).toBeVisible();
    await expect(page.getByText("Testauthor_article.pdf")).toBeVisible();

    await page.getByRole("button", { name: "Publish article" }).click();
    await expect(page.getByText(/It will appear when its issue is published/)).toBeVisible();

    await page.goto(`/admin/issues/${issueId}`);
    await page.getByRole("button", { name: "Publish issue" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Issue published.", { exact: false })).toBeVisible();

    // Live on the public site straight away (cache tags expired).
    await page.goto(`/issues/${volume}/1`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Volume ${volume} (2099)`);
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("link", { name: /Download PDF/ })).toBeVisible();
    await expect(page.getByText("Ada Testauthor").first()).toBeVisible();
  });

  test("bulk upload creates articles from a CSV and attaches matched files", async ({ page }) => {
    const issueId = await newDraftIssue(page, freshVolume());
    await page.getByRole("link", { name: "Bulk upload" }).click();
    // Titles get a per-run suffix so slugs never collide with an earlier run.
    const run = Date.now();
    const csv = readFileSync(fixture("bulk.csv"), "utf8")
      .replace("Orature, Memory and the Archive", `Orature, Memory and the Archive ${run}`)
      .replace("Voice in Hausa Poetry", `Voice in Hausa Poetry ${run}`);
    await page
      .getByLabel("Choose a CSV file")
      .setInputFiles({ name: "bulk.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("2 articles imported from the CSV.")).toBeVisible();
    await page
      .getByLabel("Choose article files")
      .setInputFiles([fixture("Okafor_bulk.pdf"), fixture("Okafor_bulk.docx"), fixture("Bello_bulk.pdf")]);
    // Exact CSV file names and the surname both match automatically.
    await expect(page.getByLabel("Article for Bello_bulk.pdf")).not.toHaveValue("");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("All done.", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Uploaded")).toHaveCount(3);

    const { data } = await adminClient()
      .from("articles")
      .select("title, pdf_file_id, docx_file_id, category:categories(name), first_page")
      .eq("issue_id", issueId)
      .order("first_page");
    expect(data).toHaveLength(2);
    expect(data?.[0]).toMatchObject({
      title: `Orature, Memory and the Archive ${run}`,
      first_page: 1,
      category: { name: "Oral Literature and Folklore" },
    });
    expect(data?.[0].pdf_file_id).not.toBeNull();
    expect(data?.[0].docx_file_id).not.toBeNull();
    expect(data?.[1].pdf_file_id).not.toBeNull();
  });

  test("a stale edit is refused with a clear message", async ({ page }) => {
    const issueId = await newDraftIssue(page, freshVolume());
    // Someone else saves the issue in the meantime.
    await adminClient().from("issues").update({ title: "Changed elsewhere" }).eq("id", issueId);
    await page.getByLabel("Title (optional)").fill("My title");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Someone else edited this." })).toBeVisible();
  });

  test("categories can be created and appear on the site", async ({ page }) => {
    const name = `Test Category ${Date.now()}`;
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await page.goto("/scope");
    await expect(page.getByRole("region", { name: "Subject areas" }).getByText(name)).toBeVisible();
  });

  test("editors can't open Super Admin sections", async ({ page }) => {
    for (const path of ["/admin/pages", "/admin/editorial-board", "/admin/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/no-access$/);
    }
  });
});

test.describe("Super Admin content", () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("editing a static page updates the public page", async ({ page }) => {
    const marker = `Edited by the end-to-end test ${Date.now()}.`;
    await page.goto("/admin/pages/privacy");
    await page.locator("#p-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(marker);
    await page.getByRole("button", { name: "Save and publish" }).click();
    await expect(page.getByText("Page saved and published.")).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByText(marker)).toBeVisible();
  });

  test("feature flags can be switched off and on", async ({ page }) => {
    await page.goto("/admin/settings");
    const flag = page.getByRole("switch", { name: /Home most read/ });
    await expect(flag).toHaveAttribute("aria-checked", "true");
    await flag.click();
    await expect(flag).toHaveAttribute("aria-checked", "false");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Most read" })).toHaveCount(0);
    await page.goto("/admin/settings");
    await page.getByRole("switch", { name: /Home most read/ }).click();
    await expect(page.getByRole("switch", { name: /Home most read/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

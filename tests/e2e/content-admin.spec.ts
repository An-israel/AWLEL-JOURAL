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
    await expect(page.getByLabel("Web address")).toHaveValue(`testing-the-archive-${volume}`);
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

    // A file whose content isn't a PDF is refused, whatever its name and type say.
    await page.getByLabel("Choose article pdf").setInputFiles({
      name: "fake.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html><script>alert(1)</script></html>"),
    });
    await expect(page.getByText("fake.pdf doesn't look like a real .pdf file.")).toBeVisible();

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

  test("reads and downloads are counted, tagged for Scholar and shown on the dashboard", async ({
    page,
    browser,
  }) => {
    const volume = freshVolume();
    const issueId = await newDraftIssue(page, volume);
    await page.getByRole("link", { name: "New article" }).click();
    const title = `Counting Readers ${volume}`;
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("First page").fill("5");
    await page.getByLabel("Last page").fill("20");
    await page.locator("#a-abstract").click();
    await page.keyboard.type("How readers are counted.");
    await page.getByLabel("Name", { exact: true }).fill("Ada Ọkafọ");
    await page.getByLabel("Affiliation", { exact: true }).fill("University of Nigeria, Nsukka");
    await page.getByRole("button", { name: "Create draft article" }).click();
    await expect(page).toHaveURL(/\/admin\/articles\/[0-9a-f-]{36}$/);
    const articleId = page.url().split("/").pop()!;
    await page.getByLabel("Choose article pdf").setInputFiles(fixture("Testauthor_article.pdf"));
    await expect(page.getByText("Article PDF uploaded.")).toBeVisible();
    await page.getByRole("button", { name: "Publish article" }).click();
    await expect(page.getByText(/It will appear when its issue is published/)).toBeVisible();
    await page.goto(`/admin/issues/${issueId}`);
    await page.getByRole("button", { name: "Publish issue" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Issue published.", { exact: false })).toBeVisible();

    // A reader in an ordinary browser (the default headless user agent counts as a bot).
    const reader = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    });
    const tab = await reader.newPage();
    await tab.goto(`/issues/${volume}/1`);
    const counted = tab.waitForResponse("**/api/metrics/view");
    await tab.getByRole("link", { name: title }).click();
    await expect(tab.getByRole("heading", { level: 1 })).toHaveText(title);
    await counted;
    await expect(tab.getByTestId("article-stats")).toHaveText("1 view0 downloads");

    // Scholar and Dublin Core tags, in the head, with the PDF route.
    const head = tab.locator("head");
    await expect(head.locator('meta[name="citation_title"]')).toHaveAttribute("content", title);
    await expect(head.locator('meta[name="citation_author"]')).toHaveAttribute("content", "Ada Ọkafọ");
    await expect(head.locator('meta[name="citation_firstpage"]')).toHaveAttribute("content", "5");
    await expect(head.locator('meta[name="citation_pdf_url"]')).toHaveAttribute(
      "content",
      new RegExp(`/api/download/article/${articleId}\\?format=pdf&inline=1$`),
    );
    await expect(head.locator('meta[name="DC.creator"]')).toHaveAttribute("content", "Ada Ọkafọ");
    const ld = (
      await tab
        .locator('script[type="application/ld+json"]')
        .evaluateAll((els) => els.map((el) => JSON.parse(el.textContent ?? "{}")))
    ).find((d) => d["@type"] === "ScholarlyArticle");
    expect(ld).toMatchObject({ "@type": "ScholarlyArticle", name: title, pageStart: "5", pageEnd: "20" });

    // Download: a clean file name, counted once per reader per day.
    const download = tab.waitForEvent("download");
    await tab.getByRole("link", { name: /Download PDF/ }).click();
    expect((await download).suggestedFilename()).toBe(`AWLEL_Vol${volume}_Okafo_2099.pdf`);
    await tab.request.get(`/api/download/article/${articleId}?format=pdf`, { maxRedirects: 0 });
    // Bots are not counted, and a missing format is a 404 rather than a broken link.
    const bot = await tab.request.get(`/api/download/article/${articleId}?format=pdf`, {
      maxRedirects: 0,
      headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
    });
    expect(bot.status()).toBe(302);
    const missing = await tab.request.get(`/api/download/article/${articleId}?format=docx`, {
      maxRedirects: 0,
    });
    expect(missing.status()).toBe(404);
    await tab.reload();
    await expect(tab.getByTestId("article-stats")).toHaveText("1 view1 download");
    await reader.close();

    const { data: counts } = await adminClient()
      .from("articles")
      .select("view_count, download_pdf_count")
      .eq("id", articleId)
      .single();
    expect(counts).toEqual({ view_count: 1, download_pdf_count: 1 });

    // Discovery files list it straight away.
    expect(await (await page.request.get("/sitemap.xml")).text()).toContain(
      `/articles/counting-readers-${volume}`,
    );
    expect(await (await page.request.get("/feed.xml")).text()).toContain(`<title>${title}</title>`);

    // The dashboard shows the reads.
    await page.goto("/admin?range=7");
    await expect(page.getByRole("img", { name: /Views and downloads per day/ })).toBeVisible();
    const top = page.getByRole("region", { name: /Top 10 articles/ });
    await expect(top.getByRole("listitem").filter({ hasText: title })).toContainText("1 view · 1 download");
  });

  test("saving a published article keeps its publication date", async ({ page }) => {
    const volume = freshVolume();
    await newDraftIssue(page, volume);
    await page.getByRole("link", { name: "New article" }).click();
    const title = `Keeping the Date ${volume}`;
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Name", { exact: true }).fill("Ada Testauthor");
    await page.getByRole("button", { name: "Create draft article" }).click();
    await expect(page).toHaveURL(/\/admin\/articles\/[0-9a-f-]{36}$/);
    const articleId = page.url().split("/").pop()!;
    await expect(page.locator("#a-date:visible")).toHaveValue("");

    await page.getByRole("button", { name: "Publish article" }).click();
    await expect(page.getByText(/It will appear when its issue is published/)).toBeVisible();
    // The form picks up the date the server set when publishing.
    await expect(page.locator("#a-date:visible")).not.toHaveValue("");

    await page.getByLabel("Title", { exact: true }).fill(`${title} (revised)`);
    await page.getByRole("button", { name: "Save article" }).click();
    await expect(page.getByText("Article saved.")).toBeVisible();
    const { data } = await adminClient()
      .from("articles")
      .select("title, published_at")
      .eq("id", articleId)
      .single();
    expect(data?.title).toBe(`${title} (revised)`);
    expect(data?.published_at).not.toBeNull();
    await expect(page.locator("#a-date:visible")).toHaveValue(data!.published_at!.slice(0, 10));
  });

  test("publishing an empty issue needs a tick, and renumbering keeps the old address", async ({ page }) => {
    const volume = freshVolume();
    await newDraftIssue(page, volume);
    await page.getByRole("button", { name: "Publish issue" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("This issue has no articles.");
    await expect(dialog).toContainText("There’s no cover image.");
    await expect(dialog.getByRole("button", { name: "Publish" })).toBeDisabled();
    await dialog.getByLabel("Publish it anyway, with no articles").check();
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Issue published.", { exact: false })).toBeVisible();

    // Changing the number of a live issue warns first, and the old address redirects.
    await page.getByLabel("Issue number").fill("2");
    await expect(page.getByText(`Its address will change from /issues/${volume}/1`)).toBeVisible();
    await page.getByRole("button", { name: "Save details" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Change the number" }).click();
    await expect(page.getByText("Issue saved.")).toBeVisible();
    await page.goto(`/issues/${volume}/1`);
    await expect(page).toHaveURL(new RegExp(`/issues/${volume}/2$`));
  });

  test("leaving a page with unsaved changes asks first", async ({ page }) => {
    const issueId = await newDraftIssue(page, freshVolume());
    await page.getByLabel("Title (optional)").fill("Not saved yet");
    await page.getByRole("link", { name: "Bulk upload" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/issues/${issueId}$`));
    await expect(page.getByLabel("Title (optional)")).toHaveValue("Not saved yet");

    await page.getByRole("link", { name: "Bulk upload" }).click();
    await dialog.getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/issues/${issueId}/bulk$`));
  });

  test("bulk upload gives articles with the same title their own web addresses", async ({ page }) => {
    const issueId = await newDraftIssue(page, freshVolume());
    await page.getByRole("link", { name: "Bulk upload" }).click();
    const title = `Same Title ${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Add row" }).click();
      await page.getByLabel("Title", { exact: true }).nth(i).fill(title);
      await page.getByLabel("Authors", { exact: true }).nth(i).fill("Ada Testauthor");
    }
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("All done.", { exact: false })).toBeVisible({ timeout: 30_000 });
    const { data } = await adminClient().from("articles").select("slug").eq("issue_id", issueId);
    const base = title.toLowerCase().replace(/ /g, "-");
    expect((data ?? []).map((a) => a.slug).sort()).toEqual([base, `${base}-2`]);
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

    // A new web address keeps the old one working.
    const slug = name.toLowerCase().replace(/ /g, "-");
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByLabel("Web address").fill(`${slug}-moved`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`/categories/${slug}-moved`, { exact: false })).toBeVisible();
    await page.goto(`/categories/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/categories/${slug}-moved$`));
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

  test("a trashed issue holds its number until it's deleted forever", async ({ page }) => {
    const volume = freshVolume();
    const issueId = await newDraftIssue(page, volume);
    await page.getByRole("button", { name: "Move to trash" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Move to trash" }).click();
    await expect(page.getByText("Issue moved to trash.", { exact: false })).toBeVisible();

    await page.goto("/admin/issues");
    const card = page.locator("div.rounded-lg", { has: page.getByText(`Volume ${volume}`, { exact: true }) });
    await card.getByRole("button", { name: "Add issue" }).click();
    await page.getByLabel("Issue no.").fill("1");
    await page.getByRole("button", { name: "Create draft issue" }).click();
    await expect(
      page.getByText("it's in the trash — restore it or delete it forever", { exact: false }),
    ).toBeVisible();

    await page.goto(`/admin/issues/${issueId}`);
    await page.getByRole("button", { name: "Delete forever" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
    await expect(page.getByText("Issue deleted forever.", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/issues$/);

    // The volume is empty now, so it can be deleted from its Edit dialog.
    await page.getByRole("button", { name: `Edit Volume ${volume}` }).click();
    await page.getByRole("button", { name: "Delete volume" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete volume" }).click();
    await expect(page.getByText("Volume deleted.")).toBeVisible();
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

    // The save is in the page's history and the audit log, which links back by slug.
    await page.goto("/admin/audit-log?action=update&entity=pages");
    const entry = page.getByRole("list", { name: "Audit log entries" }).getByRole("listitem").first();
    await expect(entry).toContainText("Edited");
    await entry.getByText("Details").click();
    await expect(entry).toContainText("Page text:");
    await entry.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/pages\/privacy$/);

    // An earlier version can be brought back into the editor (not saved until asked).
    const history = page.getByRole("region", { name: "History" });
    await history.getByRole("button", { name: "Restore this version" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Restore into the editor" }).click();
    await expect(page.getByText("Version restored into the editor.", { exact: false })).toBeVisible();
    await expect(page.locator("#p-content")).not.toContainText(marker);
  });

  test("feature flags can be switched off and on", async ({ page }) => {
    await page.goto("/admin/settings");
    const flag = page.getByRole("switch", { name: /Most read on the home page/ });
    await expect(flag).toHaveAttribute("aria-checked", "true");
    await flag.click();
    // Nothing changes until the effect has been explained and confirmed.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("disappear from the home page");
    // The open dialog hides the rest of the page from assistive technology.
    await expect(
      page.getByRole("switch", { name: /Most read on the home page/, includeHidden: true }),
    ).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Most read on the home page turned off.")).toBeVisible();
    await expect(flag).toHaveAttribute("aria-checked", "false");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Most read" })).toHaveCount(0);
    await page.goto("/admin/settings");
    await page.getByRole("switch", { name: /Most read on the home page/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByRole("switch", { name: /Most read on the home page/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

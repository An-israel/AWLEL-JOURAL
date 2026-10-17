import { expect, test } from "@playwright/test";

// Runs against the seeded sample issue (Volume 26, 2026).

test("archive → issue → article", async ({ page }) => {
  await page.goto("/issues");
  await expect(page.getByRole("heading", { level: 1, name: "All issues" })).toBeVisible();
  await page
    .getByRole("link", { name: /Volume 26 \(June 2026\)/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/issues\/26\/1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Volume 26 (June 2026)");
  const contents = page.getByRole("region", { name: "Contents" });
  await expect(contents.getByRole("article")).toHaveCount(3);
  // Every row shows its category at a glance.
  await expect(contents.getByRole("link", { name: "Linguistics" })).toBeVisible();

  // Abstract toggle works without leaving the page.
  const row = contents.getByRole("article").filter({ hasText: "Code-Switching" });
  await row.getByText("Show abstract").click();
  await expect(row.getByText(/Markedness Model/)).toBeVisible();

  await row.getByRole("link", { name: /Code-Switching and Identity/ }).click();
  await expect(page).toHaveURL(/\/articles\/sample-code-switching/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Code-Switching and Identity");
  await expect(page.getByText("Department of Linguistics, Igbo and Other Nigerian Languages")).toBeVisible();
  await expect(page.getByRole("link", { name: "Volume 26 (June 2026)" }).first()).toHaveAttribute(
    "href",
    "/issues/26/1",
  );
  // No files are uploaded for the sample, so no broken download links appear.
  await expect(page.getByRole("link", { name: /Download (PDF|Word)/ })).toHaveCount(0);
});

test("cite panel formats APA, MLA and BibTeX and offers an RIS file", async ({ page }) => {
  await page.goto("/articles/sample-code-switching-and-identity-in-igbo-english-conversations");
  const cite = page.getByRole("region", { name: "Cite this article" });
  await expect(cite.getByRole("tabpanel")).toContainText("Eze, C. J., & Nwosu, A. P. (2026).");
  await expect(cite.locator("i").first()).toHaveText("African, World Literature and English Language");

  await cite.getByRole("tab", { name: "MLA 8th" }).click();
  await expect(cite.getByRole("tabpanel")).toContainText("Eze, Chukwuemeka J., and Amaka P. Nwosu.");
  await expect(cite.getByRole("tabpanel")).toContainText("vol. 26, 2026, pp. 19–36.");

  await cite.getByRole("tab", { name: "BibTeX" }).click();
  await expect(cite.getByRole("tabpanel")).toContainText("@article{eze2026code");

  const download = page.waitForEvent("download");
  await cite.getByRole("button", { name: "Download .ris" }).click();
  expect((await download).suggestedFilename()).toBe("AWLEL_Vol26_Eze_2026.ris");
});

test("category page lists its articles and sorts by most read", async ({ page }) => {
  await page.goto("/categories/african-literature");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("African Literature");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Most read" }).click();
  await expect(page.getByRole("button", { name: "Most read" })).toHaveAttribute("aria-pressed", "true");
});

test("search finds articles by keyword and author, with highlights and filters", async ({ page }) => {
  await page.goto("/search?q=migration");
  await expect(page.getByRole("heading", { name: "1 article found" })).toBeVisible();
  await expect(page.locator("mark").first()).toHaveText(/migration/i);

  await page.goto("/search?q=Nwosu");
  await expect(page.getByRole("link", { name: /Code-Switching and Identity/ })).toBeVisible();

  await page.goto("/search?category=drama-and-theatre-studies");
  await expect(page.getByRole("heading", { name: "1 article found" })).toBeVisible();

  await page.goto("/search?q=zzzznotaword");
  await expect(page.getByRole("heading", { name: "No articles found" })).toBeVisible();
});

test("home shows the latest issue, categories and most read", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Read the latest issue" })).toHaveAttribute(
    "href",
    "/issues/26/1",
  );
  await expect(page.getByRole("heading", { name: "Browse by category" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most read" })).toBeVisible();
});

test("unknown article and issue return 404 content", async ({ page }) => {
  await page.goto("/articles/no-such-article");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page could not be found");
  await page.goto("/issues/99/9");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page could not be found");
});

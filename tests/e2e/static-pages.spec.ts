import { expect, test } from "@playwright/test";

const pages = [
  { path: "/scope", heading: "Aims and Scope" },
  { path: "/submission-guidelines", heading: "Submission Guidelines" },
  { path: "/about", heading: "About the Journal" },
  { path: "/editorial-board", heading: "Editorial Board" },
  { path: "/department", heading: "Department of English and Literary Studies" },
  { path: "/contact", heading: "Contact Us" },
  { path: "/privacy", heading: "Privacy Policy" },
];

for (const { path, heading } of pages) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("scope links every subject area to its category page", async ({ page }) => {
  await page.goto("/scope");
  const areas = page.getByRole("region", { name: "Subject areas" });
  await expect(areas.getByRole("link")).toHaveCount(10);
  await areas.getByRole("link", { name: /Poetry/ }).click();
  await expect(page).toHaveURL(/\/categories\/poetry$/);
});

test("guidelines list the required structure and end with a submit button", async ({ page }) => {
  await page.goto("/submission-guidelines");
  await expect(page.getByText("Theoretical Framework")).toBeVisible();
  await expect(page.getByText(/indented paragraphing style/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit your manuscript" })).toHaveAttribute("href", "/submit");
});

test("editorial board shows the editor and all consultants", async ({ page }) => {
  await page.goto("/editorial-board");
  await expect(page.getByText("Prof. T. M. E. Chukwumezie")).toBeVisible();
  await expect(page.getByRole("region", { name: "Editorial Consultants" }).getByRole("listitem")).toHaveCount(
    17,
  );
});

test.describe("contact form", () => {
  test("validates fields and then sends", async ({ page }) => {
    await page.goto("/contact");
    // Wait past the minimum fill time used to catch bots.
    await page.waitForTimeout(3_200);
    await page.getByRole("button", { name: "Send message" }).click();
    const form = page.locator("form").filter({ hasText: "Send us a message" });
    await expect(form.getByRole("alert")).toContainText("Please correct the highlighted fields.");
    await expect(page.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Your name").fill("Test Reader");
    await page.getByLabel("Email address").fill("reader@example.com");
    await page.getByLabel("Subject").fill("Back issues");
    await page.getByLabel("Message").fill("Where can I find the 2019 issue of AWLEL?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you" })).toContainText(
      "your message has been sent",
    );
  });
});

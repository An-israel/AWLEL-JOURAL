import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resetRateLimits, signInAndWait, SUPER_ADMIN } from "./helpers";

// WCAG 2.1 AA (section 3): automated axe checks on every kind of page. Axe
// catches about half of real issues; keyboard and screen-reader checks are
// in docs/ENGINEERING.md.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("main").waitFor();
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, `axe violations on ${path}`).toEqual([]);
}

const PUBLIC = [
  "/",
  "/issues",
  "/issues/26/1",
  "/articles/sample-code-switching-and-identity-in-igbo-english-conversations",
  "/categories/african-literature",
  "/search?q=igbo",
  "/scope",
  "/submission-guidelines",
  "/about",
  "/editorial-board",
  "/department",
  "/contact",
  "/privacy",
  "/login",
  "/signup",
  "/forgot-password",
  "/this-page-does-not-exist",
];

for (const path of PUBLIC) {
  test(`public page ${path} has no WCAG A/AA violations`, async ({ page }) => {
    await scan(page, path);
  });
}

test.describe("admin pages", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "admin is scanned once, on desktop");

  test("have no WCAG A/AA violations", async ({ page }) => {
    test.setTimeout(120_000);
    await resetRateLimits();
    await signInAndWait(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    for (const path of [
      "/admin",
      "/admin/issues",
      "/admin/articles",
      "/admin/articles/new",
      "/admin/categories",
      "/admin/submissions",
      "/admin/reviews",
      "/admin/pages",
      "/admin/pages/about",
      "/admin/editorial-board",
      "/admin/messages",
      "/admin/users",
      "/admin/settings",
      "/admin/audit-log",
      "/admin/operations",
      "/admin/profile",
      "/submit",
      "/account",
    ]) {
      await scan(page, path);
    }
  });
});

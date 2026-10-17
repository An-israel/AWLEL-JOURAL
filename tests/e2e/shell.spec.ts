import { expect, test } from "@playwright/test";

test.describe("site shell", () => {
  test("home page renders the brand, navigation and footer", async ({ page, isMobile }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "African, World Literature and English Language",
    );
    await expect(page.getByRole("contentinfo")).toContainText("ISSN 2315-5493");
    await expect(page.getByRole("contentinfo")).toContainText(
      `© ${new Date().getFullYear()} Department of English and Literary Studies, University of Nigeria, Nsukka`,
    );

    if (isMobile) {
      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu.getByRole("link")).toHaveCount(10);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    } else {
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link")).toHaveText([
        "Home",
        "Journal Archive",
        "Scope",
        "Submission Guidelines",
        "About the Journal",
        "Editorial Board",
        "The Department",
        "Contact Us",
      ]);
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    }
  });

  test("skip link moves focus to the main content", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("search dialog submits to /search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search the journal" }).click();
    await page.getByRole("searchbox").fill("migration");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/search\?q=migration/);
  });

  test("unknown pages return the custom 404", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page could not be found");
  });
});

test.describe("platform", () => {
  test("health endpoints report status", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    expect((await request.get("/api/health/live")).status()).toBe(200);
    expect((await request.get("/api/health/ready")).status()).toBe(200);
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("protected areas redirect signed-out visitors to /login", async ({ request }) => {
    const res = await request.get("/admin", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login?next=%2Fadmin");
  });
});

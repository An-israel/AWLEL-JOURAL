import { expect, test } from "@playwright/test";
import { adminClient, createUser, resetRateLimits, signIn, SUPER_ADMIN, TEST_PASSWORD } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("wrong password shows a generic error", async ({ page }) => {
  await signIn(page, SUPER_ADMIN.email, "not-the-password1");
  await expect(page.locator("form").getByRole("alert")).toHaveText("The email or password is incorrect.");
});

test("an author can register and lands on their account", async ({ page }) => {
  const email = `author-${Date.now()}@e2e.local`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Ada Okafor");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Institution (optional)").fill("University of Nigeria, Nsukka");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create author account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create author account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
  await expect(page.getByText("Author", { exact: true })).toBeVisible();

  const { data } = await adminClient()
    .from("profiles")
    .select("role, affiliation")
    .eq("email", email)
    .single();
  expect(data).toEqual({ role: "author", affiliation: "University of Nigeria, Nsukka" });
});

test("authors cannot open the admin area", async ({ page }) => {
  const author = await createUser("author", "blocked");
  await signIn(page, author.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/no-access$/);
});

test("reviewers land on their review queue and see only their sections", async ({ page }) => {
  const reviewer = await createUser("reviewer", "rev");
  await signIn(page, reviewer.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link")).toHaveText(["My profile"]);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/no-access$/);
});

test("sign-in returns people to the page they asked for", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers/);
  await page.getByLabel("Email address").fill(SUPER_ADMIN.email);
  await page.getByLabel("Password").fill(SUPER_ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
});

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
  await expect(nav.getByRole("link")).toHaveText(["Reviews", "My profile"]);
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

test("signed-in people who open /login or /signup go to their landing page", async ({ page }) => {
  const reviewer = await createUser("reviewer", "landing");
  await signIn(page, reviewer.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/admin\/reviews$/);
});

test("only failed sign-ins count, per account, so one account's failures don't lock out others", async ({
  page,
}) => {
  const target = await createUser("author", "locked");
  const other = await createUser("author", "neighbour");
  for (let i = 0; i < 5; i++) {
    await signIn(page, target.email, "Wrong-passw0rd");
    await expect(page.locator("form").getByRole("alert")).toHaveText("The email or password is incorrect.");
  }
  await signIn(page, target.email, TEST_PASSWORD);
  await expect(page.locator("form").getByRole("alert")).toContainText("Too many attempts");
  // Same IP, different account: still fine.
  await signIn(page, other.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
});

test("an expired reset or invitation link says so before the form", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a new link" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("a link with an error in its fragment shows a clear message", async ({ page }) => {
  await page.goto(
    "/auth/callback?next=%2Freset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(page).toHaveURL(/\/auth\/confirm/);
  await expect(page.getByRole("alert")).toContainText("This link has expired or has already been used.");
});

test("a link without code or token goes to /auth/confirm", async ({ page }) => {
  await page.goto("/auth/callback?next=%2Faccount");
  await expect(page).toHaveURL(/\/auth\/confirm\?next=%2Faccount$/);
  await expect(page.getByRole("alert")).toContainText("This link is incomplete.");
});

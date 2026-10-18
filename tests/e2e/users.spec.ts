import { expect, test } from "@playwright/test";
import { adminClient, createUser, resetRateLimits, signIn, SUPER_ADMIN, TEST_PASSWORD } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetRateLimits();
  await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
});

test("Super Admin changes a user's role", async ({ page }) => {
  const target = await createUser("author", "promote");
  await page.goto(`/admin/users?q=${encodeURIComponent(target.email)}`);
  await page.getByLabel(/Role for/).selectOption("reviewer");
  await page.getByRole("alertdialog").getByRole("button", { name: "Change role" }).click();
  await expect(page.getByText("Role updated.")).toBeVisible();

  const { data } = await adminClient().from("profiles").select("role").eq("id", target.id).single();
  expect(data?.role).toBe("reviewer");
  const { data: audit } = await adminClient()
    .from("audit_log")
    .select("action, actor_id")
    .eq("entity_id", target.id)
    .eq("action", "role_change")
    .single();
  expect(audit?.actor_id).not.toBeNull();
});

test("the last Super Admin cannot be demoted", async ({ page }) => {
  // Make sure the seeded admin is the only active Super Admin.
  const supabase = adminClient();
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("role", "super_admin")
    .eq("is_active", true);
  for (const a of admins ?? []) {
    if (a.email !== SUPER_ADMIN.email)
      await supabase.from("profiles").update({ role: "editor" }).eq("id", a.id);
  }
  await page.goto(`/admin/users?q=${encodeURIComponent(SUPER_ADMIN.email)}`);
  await page.getByLabel(/Role for/).selectOption("editor");
  // Changing your own role says plainly what you would lose.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "You will lose access to Users and Roles, Settings and Pages immediately",
  );
  await dialog.getByRole("button", { name: "Change my role" }).click();
  // The toast's own wording (the page description repeats the rule itself).
  await expect(page.getByText("Promote someone else first.", { exact: false })).toBeVisible();
  const { data: me } = await supabase.from("profiles").select("role").eq("email", SUPER_ADMIN.email).single();
  expect(me?.role).toBe("super_admin");
});

test("a deactivated user cannot sign in", async ({ page, browser }) => {
  const target = await createUser("editor", "deactivate");
  await page.goto(`/admin/users?q=${encodeURIComponent(target.email)}`);
  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Account deactivated.")).toBeVisible();

  const other = await browser.newPage();
  await signIn(other, target.email, TEST_PASSWORD);
  await expect(other.locator("form").getByRole("alert")).toContainText("deactivated");
  await other.close();
});

test("Super Admin invites a reviewer", async ({ page }) => {
  const email = `invitee-${Date.now()}@e2e.local`;
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a user" });
  await dialog.getByLabel("Full name").fill("Invited Reviewer");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption("reviewer");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();

  const { data } = await adminClient().from("profiles").select("role, full_name").eq("email", email).single();
  expect(data).toEqual({ role: "reviewer", full_name: "Invited Reviewer" });
});

test("an invitation error keeps what was typed, and reopening starts afresh", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a user" });
  await expect(dialog).toContainText("Reviews the manuscripts assigned to them");
  await dialog.getByLabel("Full name").fill("Typo Person");
  await dialog.getByLabel("Email").fill("not-an-email");
  await dialog.getByLabel("Role").selectOption("editor");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByText("Enter a valid email address.")).toBeVisible();
  await expect(dialog.getByLabel("Full name")).toHaveValue("Typo Person");
  await expect(dialog.getByLabel("Email")).toHaveValue("not-an-email");
  await expect(dialog.getByLabel("Role")).toHaveValue("editor");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Invite user" }).click();
  await expect(dialog.getByText("Enter a valid email address.")).toHaveCount(0);
  await expect(dialog.getByLabel("Full name")).toHaveValue("");
});

test("editors cannot open Users and Roles", async ({ page, browser }) => {
  const editor = await createUser("editor", "ed");
  const other = await browser.newPage();
  await resetRateLimits();
  await signIn(other, editor.email, TEST_PASSWORD);
  await expect(other).toHaveURL(/\/admin$/);
  await other.goto("/admin/users");
  await expect(other).toHaveURL(/\/no-access$/);
  await other.close();
  await expect(page).toHaveURL(/\/admin$/);
});

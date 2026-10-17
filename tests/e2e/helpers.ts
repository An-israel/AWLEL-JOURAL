import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

// E2E helpers talk to the local Supabase stack with the service role key from
// .env.local (written by CI from `supabase status`). Never point these at production.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be in the environment (CI).
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  if (!/127\.0\.0\.1|localhost/.test(url))
    throw new Error("Refusing to run E2E helpers against a non-local Supabase");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL ?? "admin@awlel.local",
  password: process.env.SUPER_ADMIN_PASSWORD ?? "LocalAdmin-Passw0rd",
};

export const TEST_PASSWORD = "E2e-test-passw0rd";

/** Creates a confirmed user with the given role and returns its email. */
export async function createUser(role: "author" | "reviewer" | "editor" | "super_admin", label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.local`;
  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: `E2E ${label}` },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  // The profile trigger creates every account as an author; roles are then set
  // explicitly, exactly as invitations do.
  if (role !== "author") {
    const { error: roleError } = await supabase.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) throw roleError;
  }
  return { id: data.user.id, email };
}

/** The rate limiter would block repeated test logins from one IP. */
export async function resetRateLimits() {
  await adminClient().from("rate_limits").delete().neq("key", "");
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

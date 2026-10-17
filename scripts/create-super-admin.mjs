#!/usr/bin/env node
// Creates (or promotes) the first Super Admin from environment variables.
//   SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME,
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Usage: npm run seed:admin   (reads .env.local if present)
// Safe to re-run: an existing account is promoted, not duplicated.
import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPER_ADMIN_EMAIL"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const email = process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;
const fullName = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserId() {
  const { data, error } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

let userId = await findUserId();

if (!userId) {
  if (!password || password.length < 12) {
    console.error("SUPER_ADMIN_PASSWORD must be at least 12 characters to create the account.");
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "super_admin" },
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error(`Could not create user: ${error.message}`);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Created Super Admin ${email}`);
} else {
  await supabase.auth.admin.updateUserById(userId, { app_metadata: { role: "super_admin" } });
  console.log(`Account ${email} already exists; promoting to Super Admin`);
}

const { error } = await supabase
  .from("profiles")
  .update({ role: "super_admin", is_active: true, full_name: fullName })
  .eq("id", userId);
if (error) {
  console.error(`Could not update profile: ${error.message}`);
  process.exit(1);
}
console.log("Done. Sign in at /login. Remove SUPER_ADMIN_PASSWORD from your environment now.");

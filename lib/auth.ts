import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "./roles";

/*
 * Data Access Layer for the signed-in user. Every protected page and server
 * action calls these on the server; hiding buttons in the UI is never the
 * only check (section 6), and RLS backs everything up in the database.
 */

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  affiliation: string | null;
  orcid: string | null;
}

/** The signed-in, active user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Session checks compare token expiry with the clock, so they must run at
  // request time, never during prerendering.
  await connection();
  const supabase = await createSupabaseServerClient();
  // getUser() verifies the token with Supabase Auth; getSession() would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, affiliation, orcid, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    role: profile.role,
    affiliation: profile.affiliation,
    orcid: profile.orcid,
  };
});

export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireRole(roles: readonly UserRole[], nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (!roles.includes(user.role)) redirect("/no-access");
  return user;
}

/** For server actions: returns the user or null instead of redirecting. */
export async function userWithRole(roles: readonly UserRole[]): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && roles.includes(user.role) ? user : null;
}

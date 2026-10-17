"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { siteUrl } from "@/lib/env.public";
import { landingPathFor, safeNextPath, type UserRole } from "@/lib/roles";
import { logger } from "@/lib/server/logger";
import { checkRateLimit, clientIp, RATE_LIMITS, type RateLimitRule } from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fieldErrorsOf,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "./schemas";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

/** Limits by IP and, where given, by account, so neither can be brute-forced (item 1). */
async function limited(rule: RateLimitRule, account?: string): Promise<string | null> {
  const ip = clientIp(await headers());
  const checks = [checkRateLimit(rule, `ip:${ip}`)];
  if (account) checks.push(checkRateLimit(rule, `account:${account.toLowerCase()}`));
  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  return blocked
    ? `Too many attempts. Please wait about ${Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60))} minutes and try again.`
    : null;
}

function callbackUrl(next: string): string {
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = signInSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };

  const blocked = await limited(RATE_LIMITS.login, parsed.data.email);
  if (blocked) return { status: "error", message: blocked, values };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const code = error?.code;
    const message =
      code === "email_not_confirmed"
        ? "Please confirm your email address first. Check your inbox for the link we sent."
        : code === "user_banned"
          ? "This account has been deactivated. Contact the editorial office if you think this is a mistake."
          : "The email or password is incorrect.";
    return { status: "error", message, values };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return {
      status: "error",
      message:
        "This account has been deactivated. Contact the editorial office if you think this is a mistake.",
      values,
    };
  }

  logger.info({ userId: data.user.id }, "signed in");
  redirect(safeNextPath(str(fd, "next")) ?? landingPathFor(profile.role as UserRole));
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = {
    fullName: str(fd, "fullName"),
    email: str(fd, "email"),
    affiliation: str(fd, "affiliation") || undefined,
    password: str(fd, "password"),
  };
  const values = { fullName: raw.fullName, email: raw.email, affiliation: raw.affiliation ?? "" };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };

  const blocked = await limited(RATE_LIMITS.signup);
  if (blocked) return { status: "error", message: blocked, values };

  const supabase = await createSupabaseServerClient();
  // Self-registration always creates an author; the role is fixed in the
  // database trigger and cannot be chosen here.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, affiliation: parsed.data.affiliation ?? "" },
      emailRedirectTo: callbackUrl("/account"),
    },
  });
  if (error) {
    const message =
      error.code === "weak_password"
        ? "Please choose a stronger password."
        : error.code === "user_already_exists"
          ? "An account with this email already exists. Sign in or reset your password."
          : "We couldn't create your account. Please try again.";
    if (!["weak_password", "user_already_exists"].includes(error.code ?? "")) {
      logger.warn({ err: error.message, code: error.code }, "sign-up failed");
    }
    return { status: "error", message, values };
  }

  // With email confirmation on (production) there is no session yet.
  if (data.session) redirect(safeNextPath(str(fd, "next")) ?? "/account");
  return {
    status: "success",
    message: `We've sent a confirmation link to ${parsed.data.email}. Open it to activate your account.`,
  };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const blocked = await limited(RATE_LIMITS.passwordReset, parsed.data.email);
  if (blocked) return { status: "error", message: blocked };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/reset-password"),
  });
  if (error) logger.warn({ code: error.code }, "password reset request failed");
  // Same answer whether or not the account exists, so emails can't be enumerated.
  return {
    status: "success",
    message: "If an account exists for that email, a link to reset the password is on its way.",
  };
}

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "This link has expired. Please request a new password reset email." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "same_password"
          ? "Choose a password you haven't used for this account before."
          : "We couldn't update your password. Please try again.",
    };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  redirect(landingPathFor((profile?.role ?? "author") as UserRole));
}

export async function signInWithGoogle(fd: FormData): Promise<void> {
  const flags = await getFeatureFlags();
  if (!flags.google_sign_in) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNextPath(str(fd, "next")) ?? "/account") },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

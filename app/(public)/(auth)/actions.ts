"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { siteUrl } from "@/lib/env.public";
import { landingPathFor, safeNextPath, type UserRole } from "@/lib/roles";
import { logger } from "@/lib/server/logger";
import {
  blockedMessage,
  checkRateLimit,
  clientIp,
  peekRateLimit,
  RATE_LIMITS,
} from "@/lib/server/rate-limit";
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

const account = (email: string) => `account:${email.trim().toLowerCase()}`;

/** Limits by IP and, where given, by account, so neither can be brute-forced (item 1). */
async function limited(
  ipRule: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS],
  accountRule?: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS],
  email?: string,
): Promise<string | null> {
  const ip = clientIp(await headers());
  const checks = [checkRateLimit(ipRule, `ip:${ip}`)];
  if (accountRule && email) checks.push(checkRateLimit(accountRule, account(email)));
  return blockedMessage(await Promise.all(checks));
}

/** Emailed links and OAuth return here. Without `next`, people land by role. */
function callbackUrl(next?: string | null): string {
  return `${siteUrl}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
}

const ACCOUNT_DEACTIVATED =
  "This account has been deactivated. Contact the editorial office if you think this is a mistake.";

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = signInSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };

  // Only failed sign-ins count (item 44): a busy campus network shares one
  // IP, so the IP ceiling is high; each account has its own, low, limit.
  const ip = clientIp(await headers());
  const buckets = [
    [RATE_LIMITS.loginFailuresPerIp, `ip:${ip}`],
    [RATE_LIMITS.loginFailuresPerAccount, account(parsed.data.email)],
  ] as const;
  const blocked = blockedMessage(await Promise.all(buckets.map(([rule, id]) => peekRateLimit(rule, id))));
  if (blocked) return { status: "error", message: blocked, values };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const code = error?.code;
    // Supabase says "not confirmed" only for the right password, so it isn't a guess.
    if (code === "email_not_confirmed") {
      return {
        status: "error",
        message:
          "Please confirm your email address first. Open the link in the email we sent you, or ask for a new one below.",
        values,
        resend: true,
      };
    }
    await Promise.all(buckets.map(([rule, id]) => checkRateLimit(rule, id)));
    const message = code === "user_banned" ? ACCOUNT_DEACTIVATED : "The email or password is incorrect.";
    return { status: "error", message, values };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { status: "error", message: ACCOUNT_DEACTIVATED, values };
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

  const blocked = await limited(RATE_LIMITS.signupPerIp, RATE_LIMITS.signupPerEmail, parsed.data.email);
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
    values: { email: parsed.data.email },
    resend: true,
  };
}

/**
 * Sends the sign-up confirmation email again (item 45). Rate limited, and the
 * same answer whether or not the account exists, so emails can't be enumerated.
 */
export async function resendConfirmation(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), resend: true };
  const blocked = await limited(RATE_LIMITS.signupPerIp, RATE_LIMITS.confirmationResend, parsed.data.email);
  if (blocked)
    return { status: "error", message: blocked, values: { email: parsed.data.email }, resend: true };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl("/account") },
  });
  if (error) logger.warn({ code: error.code }, "confirmation resend failed");
  return {
    status: "success",
    message:
      "If that address is waiting to be confirmed, a new link is on its way. It can take a few minutes to arrive, so please check your spam folder too.",
    values: { email: parsed.data.email },
    resend: true,
  };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const blocked = await limited(RATE_LIMITS.passwordReset, RATE_LIMITS.passwordReset, parsed.data.email);
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
  // No explicit `next`: the callback sends people to their landing page by role (item 46).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNextPath(str(fd, "next"))) },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

/**
 * Where someone goes after an emailed link signed them in in the browser
 * (/auth/confirm, item 3/4): invitations and resets choose a password; other
 * links go to `next` or the person's landing page.
 */
export async function destinationAfterLink(type: string | null, next: string | null): Promise<string> {
  if (type === "invite") return "/reset-password?welcome=1";
  if (type === "recovery") return "/reset-password";
  const explicit = safeNextPath(next);
  if (explicit) return explicit;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login?error=link";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return landingPathFor((profile?.role ?? "author") as UserRole);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

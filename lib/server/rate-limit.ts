import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashIdentifier } from "./crypto";
import { logger } from "./logger";

export interface RateLimitRule {
  /** Bucket name, e.g. "contact" or "login". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Limits used across the site (item 1). Tune here, not at call sites.
 * Sign-in counts failures only (item 44): many students share one campus IP,
 * so the per-IP ceiling is high, and each account gets its own low limit so
 * a password still can't be guessed.
 */
export const RATE_LIMITS = {
  loginFailuresPerIp: { name: "login_fail_ip", limit: 50, windowSeconds: 600 },
  loginFailuresPerAccount: { name: "login_fail_account", limit: 5, windowSeconds: 600 },
  signupPerIp: { name: "signup_ip", limit: 30, windowSeconds: 3600 },
  signupPerEmail: { name: "signup_email", limit: 3, windowSeconds: 3600 },
  confirmationResend: { name: "confirmation_resend", limit: 3, windowSeconds: 3600 },
  passwordReset: { name: "password_reset", limit: 5, windowSeconds: 3600 },
  contact: { name: "contact", limit: 5, windowSeconds: 3600 },
  submission: { name: "submission", limit: 10, windowSeconds: 3600 },
  download: { name: "download", limit: 120, windowSeconds: 60 },
  publicApi: { name: "public_api", limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Postgres-backed fixed-window limiter. `identity` (an IP or user id) is
 * hashed before it reaches the database. If the database is unreachable the
 * request is allowed: an outage should not lock everyone out.
 */
export async function checkRateLimit(rule: RateLimitRule, identity: string): Promise<RateLimitResult> {
  const key = `${rule.name}:${hashIdentifier(identity)}`;
  const { data, error } = await createSupabaseAdminClient()
    .rpc("check_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    .single();
  if (error || !data) {
    logger.warn({ err: error, rule: rule.name }, "rate limiter unavailable; allowing request");
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
  return {
    allowed: data.allowed,
    remaining: data.remaining,
    retryAfterSeconds: data.retry_after_seconds,
  };
}

/**
 * Reads a bucket without counting a hit, for limits that count only some
 * outcomes (failed sign-ins): check first, then `checkRateLimit` to record
 * a failure. Fails open, like checkRateLimit.
 */
export async function peekRateLimit(rule: RateLimitRule, identity: string): Promise<RateLimitResult> {
  const key = `${rule.name}:${hashIdentifier(identity)}`;
  const { data, error } = await createSupabaseAdminClient()
    .rpc("peek_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    .single();
  if (error || !data) {
    logger.warn({ err: error, rule: rule.name }, "rate limiter unavailable; allowing request");
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
  return {
    allowed: data.allowed,
    remaining: data.remaining,
    retryAfterSeconds: data.retry_after_seconds,
  };
}

/** The message to show when any of several limits is used up (waits in whole minutes, at least one). */
export function blockedMessage(results: RateLimitResult[]): string | null {
  const blocked = results.filter((r) => !r.allowed);
  if (!blocked.length) return null;
  const minutes = Math.max(1, Math.ceil(Math.max(...blocked.map((r) => r.retryAfterSeconds)) / 60));
  return `Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

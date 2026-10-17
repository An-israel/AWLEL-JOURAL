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

/** Limits used across the site (item 1). Tune here, not at call sites. */
export const RATE_LIMITS = {
  login: { name: "login", limit: 10, windowSeconds: 600 },
  signup: { name: "signup", limit: 5, windowSeconds: 3600 },
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

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

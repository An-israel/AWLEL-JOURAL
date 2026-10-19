import "server-only";
import { z } from "zod";
import { logger } from "@/lib/server/logger";

// Server-only secrets. Importing this file from a client component fails the
// build (via `server-only`), so the service role key can never reach a browser.

// Without these the site can't work at all, so a missing or invalid value
// fails loudly, naming the variable.
const required = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // Salt for hashing session ids and rate-limit keys. Rotate yearly.
  METRICS_SALT: z.string().min(16),
});

// "Name <address>" or a bare address.
const sender = z
  .string()
  .regex(/^(?:[^<>]*<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/);

// Optional extras. One that is set but invalid (a stray space inside an
// address, a mistyped URL) is treated as not set, with one warning in the
// logs, so a typo in, say, ALERT_EMAIL can't take sign-in, submissions and
// the scheduled tasks down with it.
const optional = {
  // Shared secret Vercel Cron sends as `Authorization: Bearer <secret>`.
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  // No default: email is only sent once RESEND_API_KEY and EMAIL_FROM are both
  // set (lib/server/email.ts); a made-up sender would be refused by Resend.
  EMAIL_FROM: sender.optional(),
  // Only for tests: a stand-in for Resend's API. Never set in production.
  RESEND_API_URL: z.url().default("https://api.resend.com"),
  EDITORIAL_EMAIL: z.email().default("awlel.journal@gmail.com"),
  ALERT_EMAIL: z.email().optional(),
  SENTRY_DSN: z.url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
};

type OptionalEnv = { [K in keyof typeof optional]: z.infer<(typeof optional)[K]> };
export type ServerEnv = z.infer<typeof required> & OptionalEnv;

let cached: ServerEnv | undefined;

/** Trimmed, with blank treated as not set (Vercel keeps pasted spaces and newlines). */
function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Parsed lazily so `next build` can run without secrets for static checks. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const env = process.env;
  const parsed = required.safeParse({
    // Names set by the Supabase–Vercel integration, accepted as fallbacks.
    SUPABASE_SERVICE_ROLE_KEY: clean(env.SUPABASE_SERVICE_ROLE_KEY) ?? clean(env.SUPABASE_SECRET_KEY),
    // Until METRICS_SALT is set, the integration's JWT secret is a usable secret salt.
    METRICS_SALT: clean(env.METRICS_SALT) ?? clean(env.SUPABASE_JWT_SECRET),
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables. See .env.example.\n${z.prettifyError(parsed.error)}`,
    );
  }

  const extras: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(optional)) {
    const result = schema.safeParse(clean(env[name]));
    if (result.success) {
      extras[name] = result.data;
    } else {
      // The value itself may be a secret, so only the name is logged.
      logger.warn(
        { variable: name },
        `environment variable ${name} is not valid and is ignored; fix it in Vercel → Settings → Environment Variables`,
      );
      extras[name] = schema.parse(undefined);
    }
  }

  cached = { ...parsed.data, ...(extras as OptionalEnv) };
  return cached;
}

/** For tests: forget the parsed values so the next call reads process.env again. */
export function resetServerEnvForTests() {
  cached = undefined;
}

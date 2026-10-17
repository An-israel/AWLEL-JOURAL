import "server-only";
import { z } from "zod";

// Server-only secrets. Importing this file from a client component fails the
// build (via `server-only`), so the service role key can never reach a browser.
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // Salt for hashing session ids and rate-limit keys. Rotate yearly.
  METRICS_SALT: z.string().min(16),
  // Shared secret Vercel Cron sends as `Authorization: Bearer <secret>`.
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default("AWLEL Journal <no-reply@example.com>"),
  EDITORIAL_EMAIL: z.email().default("awlel.journal@gmail.com"),
  ALERT_EMAIL: z.email().optional(),
  SENTRY_DSN: z.url().optional().or(z.literal("")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

let cached: z.infer<typeof schema> | undefined;

/** Parsed lazily so `next build` can run without secrets for static checks. */
export function serverEnv(): z.infer<typeof schema> {
  if (cached) return cached;
  const env = process.env;
  const parsed = schema.safeParse({
    ...env,
    // Names set by the Supabase–Vercel integration, accepted as fallbacks.
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY,
    // Until METRICS_SALT is set, the integration's JWT secret is a usable secret salt.
    METRICS_SALT: env.METRICS_SALT || env.SUPABASE_JWT_SECRET,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables. See .env.example.\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

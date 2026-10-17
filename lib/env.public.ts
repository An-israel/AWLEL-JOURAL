import { z } from "zod";

// Client-safe configuration. Only NEXT_PUBLIC_* values may appear here; they
// are inlined into the browser bundle at build time.
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional().or(z.literal("")),
});

// Each variable is referenced explicitly so Next.js can inline it. The
// fallbacks are the names the Supabase–Vercel integration and Vercel itself
// set, so a project connected through the integration works without renaming.
const vercelHost =
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
const parsed = schema.safeParse({
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : undefined),
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  throw new Error(
    `Invalid public environment variables. See .env.example.\n${z.prettifyError(parsed.error)}`,
  );
}

export const publicEnv = parsed.data;
export const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

// Client-safe configuration. Only NEXT_PUBLIC_* values may appear here; they
// are inlined into the browser bundle at build time. Validated with plain
// checks rather than zod, because this file ships to every visitor and zod
// would add ~100 KB to every public page.

function url(name: string, value: string | undefined, fallback?: string): string {
  const v = value || fallback;
  try {
    if (!v) throw new Error("missing");
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) throw new Error("not http(s)");
    return v;
  } catch (e) {
    throw new Error(
      `Invalid public environment variable ${name} (${(e as Error).message}). See .env.example.`,
    );
  }
}

// Each variable is referenced explicitly so Next.js can inline it. The
// fallbacks are the names the Supabase–Vercel integration and Vercel itself
// set, so a project connected through the integration works without renaming.
const vercelHost =
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
if (anonKey.length < 20) {
  throw new Error("Invalid public environment variable NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.");
}
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

export const publicEnv = {
  NEXT_PUBLIC_SITE_URL: url(
    "NEXT_PUBLIC_SITE_URL",
    process.env.NEXT_PUBLIC_SITE_URL,
    vercelHost ? `https://${vercelHost}` : "http://localhost:3000",
  ),
  NEXT_PUBLIC_SUPABASE_URL: url("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  NEXT_PUBLIC_SENTRY_DSN: sentryDsn ? url("NEXT_PUBLIC_SENTRY_DSN", sentryDsn) : "",
};

export const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

import { NextResponse, type NextRequest } from "next/server";
import { connection } from "next/server";
import { checkDependencies } from "@/lib/server/health";
import { logger } from "@/lib/server/logger";
import { checkRateLimit, clientIp, RATE_LIMITS } from "@/lib/server/rate-limit";

/**
 * Full health check for uptime monitors: 200 when healthy, 503 otherwise.
 * Public, so it says which dependency failed and how fast each answered, but
 * never the underlying error text (that goes to the log).
 */
export async function GET(request: NextRequest) {
  await connection();
  const limit = await checkRateLimit(RATE_LIMITS.publicApi, clientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { status: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" },
      },
    );
  }
  const result = await checkDependencies();
  const checks = Object.fromEntries(
    Object.entries(result.checks).map(([name, c]) => {
      if (!c.ok) logger.error({ dependency: name, err: c.error }, "health check failed");
      return [name, { ok: c.ok, latencyMs: c.latencyMs }];
    }),
  );
  return NextResponse.json(
    {
      status: result.ok ? "ok" : "degraded",
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? "dev",
      time: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

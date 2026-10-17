import { NextResponse } from "next/server";
import { connection } from "next/server";
import { checkDependencies } from "@/lib/server/health";

/** Full health check for uptime monitors: 200 when healthy, 503 otherwise. */
export async function GET() {
  await connection();
  const result = await checkDependencies();
  return NextResponse.json(
    {
      status: result.ok ? "ok" : "degraded",
      checks: result.checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? "dev",
      time: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

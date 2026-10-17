import { NextResponse } from "next/server";
import { connection } from "next/server";
import { checkDependencies } from "@/lib/server/health";

/** Readiness probe: dependencies reachable (item 57). */
export async function GET() {
  await connection();
  const result = await checkDependencies();
  return NextResponse.json(
    { ready: result.ok },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

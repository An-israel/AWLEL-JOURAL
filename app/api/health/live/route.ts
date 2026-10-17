import { NextResponse } from "next/server";
import { connection } from "next/server";

/** Liveness probe: the process is up and serving. No dependency calls. */
export async function GET() {
  await connection();
  return NextResponse.json({ live: true }, { headers: { "Cache-Control": "no-store" } });
}

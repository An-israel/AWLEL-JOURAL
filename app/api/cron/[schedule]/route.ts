import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { bearerMatches } from "@/lib/ops/signatures";
import { runSchedule, type Schedule } from "@/lib/server/cron";
import { errorResponse } from "@/lib/server/api";
import { ApiError, notFound } from "@/lib/server/errors";

/*
 * Cron entry points (item 21):
 *   GET /api/cron/daily  Vercel Cron, once a day (vercel.json)
 *   GET /api/cron/queue  GitHub Actions, every 30 minutes (.github/workflows/scheduled.yml)
 * Both need `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 60;

const SCHEDULES = new Set<Schedule>(["daily", "queue"]);

export async function GET(request: NextRequest, { params }: RouteContext<"/api/cron/[schedule]">) {
  const requestId = crypto.randomUUID();
  const { schedule } = await params;
  if (!bearerMatches(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return errorResponse(new ApiError(401, "unauthorized", "Missing or wrong cron secret"), requestId);
  }
  if (!SCHEDULES.has(schedule as Schedule)) return errorResponse(notFound("Unknown schedule"), requestId);

  const reports = await runSchedule(schedule as Schedule);
  const failed = reports.some((r) => r.status === "failed");
  return NextResponse.json(
    { ok: !failed, reports },
    // A failed task returns 500 so Vercel and GitHub show the run as failed.
    { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
  );
}

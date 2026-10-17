import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { bearerMatches } from "@/lib/ops/signatures";
import { apiRoute } from "@/lib/server/api";
import { recordExternalRun } from "@/lib/server/cron";
import { ApiError } from "@/lib/server/errors";

/**
 * Work that runs outside the app reports here, so the Operations page and
 * the alerts know about it: the weekly backup workflow posts its result.
 */
const body = z.object({
  task: z.enum(["backup"]),
  status: z.enum(["succeeded", "failed"]),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  error: z.string().max(2000).optional(),
});

export const POST = apiRoute({ body, skipOriginCheck: true }, async ({ request, body }) => {
  if (!bearerMatches(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    throw new ApiError(401, "unauthorized", "Missing or wrong cron secret");
  }
  await recordExternalRun(body.task, body.status, body.detail, body.error);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
});

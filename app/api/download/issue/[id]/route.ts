import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { downloadIssue } from "@/lib/server/downloads";
import { notFound } from "@/lib/server/errors";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

const query = z.object({
  // "docx" is still accepted so old Word links get a plain "not available".
  format: z.enum(["pdf", "docx"]),
  inline: z.literal("1").optional(),
});

export async function GET(request: NextRequest, { params }: RouteContext<"/api/download/issue/[id]">) {
  const { id } = await params;
  return apiRoute({ query, rateLimit: RATE_LIMITS.download }, async (ctx) => {
    if (!z.uuid().safeParse(id).success) throw notFound("This file is not available.");
    if (ctx.query.format !== "pdf") throw notFound("This file is not available.");
    return downloadIssue(ctx.request.headers, id, "pdf", ctx.query.inline === "1");
  })(request);
}

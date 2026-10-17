import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { downloadArticle } from "@/lib/server/downloads";
import { notFound } from "@/lib/server/errors";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

const query = z.object({
  format: z.enum(["pdf", "docx"]),
  inline: z.literal("1").optional(),
});

export async function GET(request: NextRequest, { params }: RouteContext<"/api/download/article/[id]">) {
  const { id } = await params;
  return apiRoute({ query, rateLimit: RATE_LIMITS.download }, async (ctx) => {
    if (!z.uuid().safeParse(id).success) throw notFound("This file is not available.");
    return downloadArticle(ctx.request.headers, id, ctx.query.format, ctx.query.inline === "1");
  })(request);
}

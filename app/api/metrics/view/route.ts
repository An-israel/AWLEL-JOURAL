import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { recordEvent } from "@/lib/server/metrics";
import { RATE_LIMITS } from "@/lib/server/rate-limit";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/*
 * Counts an article view (section 9). Article pages are static, so the page
 * calls this from the browser once it has loaded; crawlers that don't run
 * scripts are never counted. Replies with the current counts so the page can
 * show them without waiting for its cache to refresh.
 */
const body = z.object({ articleId: z.uuid() });

export const POST = apiRoute({ body, rateLimit: RATE_LIMITS.publicApi }, async ({ request, body }) => {
  await recordEvent(request.headers, "view", { articleId: body.articleId });
  const { data } = await createSupabasePublicClient()
    .from("articles")
    .select("view_count, download_count")
    .eq("id", body.articleId)
    .maybeSingle();
  return NextResponse.json(
    { views: data?.view_count ?? null, downloads: data?.download_count ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
});

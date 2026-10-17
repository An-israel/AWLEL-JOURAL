import type { NextRequest } from "next/server";
import { apiJson, articleDetailJson, preflight } from "@/lib/api/v1";
import { getArticleBySlug } from "@/lib/data/catalog";
import { getSiteSettings } from "@/lib/data/site-settings";
import { siteUrl } from "@/lib/env.public";
import { apiRoute } from "@/lib/server/api";
import { notFound } from "@/lib/server/errors";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

/** One article with abstract, authors and ready-made citations. Old slugs redirect. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/v1/articles/[slug]">) {
  const { slug } = await params;
  return apiRoute({ publicCors: true, rateLimit: RATE_LIMITS.publicApi }, async () => {
    const [result, settings] = await Promise.all([
      /^[a-z0-9-]{1,200}$/.test(slug) ? getArticleBySlug(slug) : null,
      getSiteSettings(),
    ]);
    if (!result) throw notFound("No published article with that slug.");
    if ("redirectTo" in result) {
      return Response.redirect(`${siteUrl}/api/v1/articles/${result.redirectTo}`, 301);
    }
    return apiJson({ data: articleDetailJson(result.article, settings) });
  })(request);
}
export const OPTIONS = preflight;

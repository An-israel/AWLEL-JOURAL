import { apiJson, API_VERSION, preflight } from "@/lib/api/v1";
import { siteUrl } from "@/lib/env.public";
import { apiRoute } from "@/lib/server/api";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

/** Index of the public API (item 102). */
export const GET = apiRoute({ publicCors: true, rateLimit: RATE_LIMITS.publicApi }, async () =>
  apiJson({
    name: "AWLEL public API",
    version: API_VERSION,
    endpoints: {
      issues: `${siteUrl}/api/v1/issues`,
      issue: `${siteUrl}/api/v1/issues/{volume}/{issue}`,
      articles: `${siteUrl}/api/v1/articles?limit=50`,
      article: `${siteUrl}/api/v1/articles/{slug}`,
      categories: `${siteUrl}/api/v1/categories`,
    },
    terms: "Open access. Please cache responses and keep under 300 requests a minute.",
  }),
);
export const OPTIONS = preflight;

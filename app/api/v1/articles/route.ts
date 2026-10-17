import { z } from "zod";
import { apiJson, articleSummaryJson, preflight } from "@/lib/api/v1";
import { getLatestArticles } from "@/lib/data/catalog";
import { apiRoute } from "@/lib/server/api";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

/** The newest published articles. For a whole issue, use /api/v1/issues/{volume}/{issue}. */
export const GET = apiRoute(
  { query, publicCors: true, rateLimit: RATE_LIMITS.publicApi },
  async ({ query }) => {
    const articles = await getLatestArticles(query.limit);
    return apiJson({ data: articles.map(articleSummaryJson) });
  },
);
export const OPTIONS = preflight;

import { apiJson, preflight } from "@/lib/api/v1";
import { getCategoriesWithCounts } from "@/lib/data/catalog";
import { siteUrl } from "@/lib/env.public";
import { apiRoute } from "@/lib/server/api";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

/** Subject areas with their published article counts. */
export const GET = apiRoute({ publicCors: true, rateLimit: RATE_LIMITS.publicApi }, async () => {
  const categories = await getCategoriesWithCounts();
  return apiJson({
    data: categories.map((c) => ({
      name: c.name,
      slug: c.slug,
      description: c.description,
      article_count: c.articleCount,
      url: `${siteUrl}/categories/${c.slug}`,
    })),
  });
});
export const OPTIONS = preflight;

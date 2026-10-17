import { apiJson, issueJson, preflight } from "@/lib/api/v1";
import { getArticleCountsByIssue, getPublishedIssues } from "@/lib/data/catalog";
import { apiRoute } from "@/lib/server/api";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

/** Every published issue, newest first. */
export const GET = apiRoute({ publicCors: true, rateLimit: RATE_LIMITS.publicApi }, async () => {
  const [issues, counts] = await Promise.all([getPublishedIssues(), getArticleCountsByIssue()]);
  return apiJson({ data: issues.map((i) => issueJson(i, { article_count: counts[i.id] ?? 0 })) });
});
export const OPTIONS = preflight;

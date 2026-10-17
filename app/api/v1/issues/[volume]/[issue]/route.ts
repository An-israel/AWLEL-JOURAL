import type { NextRequest } from "next/server";
import { apiJson, articleSummaryJson, issueJson, preflight } from "@/lib/api/v1";
import { getIssue } from "@/lib/data/catalog";
import { apiRoute } from "@/lib/server/api";
import { notFound } from "@/lib/server/errors";
import { RATE_LIMITS } from "@/lib/server/rate-limit";

/** One issue with its table of contents. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/v1/issues/[volume]/[issue]">) {
  const { volume, issue: number } = await params;
  return apiRoute({ publicCors: true, rateLimit: RATE_LIMITS.publicApi }, async () => {
    const valid = /^\d{1,4}$/.test(volume) && /^\d{1,4}$/.test(number);
    const issue = valid ? await getIssue(Number(volume), Number(number)) : null;
    if (!issue) throw notFound("No published issue with that volume and number.");
    return apiJson({
      data: {
        ...issueJson(issue, {
          article_count: issue.articles.length,
          has_pdf: Boolean(issue.fullPdf),
          has_docx: Boolean(issue.fullDocx),
        }),
        articles: issue.articles.map(articleSummaryJson),
      },
    });
  })(request);
}
export const OPTIONS = preflight;

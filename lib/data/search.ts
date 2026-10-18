import "server-only";
import { z } from "zod";
import { decodeEntities, isPrerenderAbort } from "@/lib/search-text";
import { logger } from "@/lib/server/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const SEARCH_PAGE_SIZE = 10;

/** Validated search parameters from the URL (section 5.5). */
export const searchParamsSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  year: z.coerce.number().int().min(1990).max(2200).optional().catch(undefined),
  issue: z.uuid().optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(120)
    .optional()
    .catch(undefined),
  author: z.string().trim().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export interface SearchHit {
  id: string;
  slug: string;
  titleHighlight: string;
  abstractHighlight: string;
}

async function runSearch(params: SearchParams, page: number) {
  const { data, error } = await createSupabasePublicClient().rpc("search_articles", {
    p_query: params.q ?? "",
    p_year: params.year,
    p_issue_id: params.issue,
    p_category_slug: params.category,
    p_author: params.author || undefined,
    p_limit: SEARCH_PAGE_SIZE,
    p_offset: (page - 1) * SEARCH_PAGE_SIZE,
  });
  if (error) {
    if (isPrerenderAbort(error)) throw error;
    logger.error({ err: error }, "search failed");
    throw new Error("Search is temporarily unavailable");
  }
  return data ?? [];
}

export async function searchArticles(params: SearchParams): Promise<{ hits: SearchHit[]; total: number }> {
  const page = params.page ?? 1;
  const rows = await runSearch(params, page);
  let total = rows.length ? Number(rows[0].total_count) : 0;
  // A page past the end has no rows to carry the total, so ask for page 1's
  // (item 33): the page can then say how many pages there really are.
  if (rows.length === 0 && page > 1) {
    const first = await runSearch(params, 1);
    total = first.length ? Number(first[0].total_count) : 0;
  }
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      titleHighlight: decodeEntities(r.title_highlight),
      abstractHighlight: decodeEntities(r.abstract_highlight),
    })),
  };
}

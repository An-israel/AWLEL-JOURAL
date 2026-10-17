import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * N+1 guard (item 27): building a page from the catalogue makes the same
 * number of database queries whether an issue has 1 article or 40. The
 * Supabase client is a fake that counts queries and returns canned rows.
 */

let articleCount = 1;
const queries: string[] = [];

function rows(table: string) {
  const issue = {
    id: "issue-1",
    issue_number: 1,
    month: 6,
    legacy_number: null,
    title: null,
    published_at: "2025-06-30",
    cover_alt: null,
    volume: { volume_number: 25, year: 2025 },
    cover: null,
  };
  const articles = Array.from({ length: articleCount }, (_, i) => ({
    id: `a${i}`,
    slug: `article-${i}`,
    title: `Article ${i}`,
    abstract: null,
    first_page: i * 10 + 1,
    last_page: i * 10 + 9,
    published_at: "2025-06-30",
    issue_id: "issue-1",
    sort_order: i,
    pdf_file_id: null,
    docx_file_id: null,
    view_count: 0,
    download_count: 0,
    category: { name: "Linguistics", slug: "linguistics" },
  }));
  switch (table) {
    case "issues":
      return [issue];
    case "articles":
      return articles;
    case "public_article_authors":
      return articles.flatMap((a) => [
        {
          article_id: a.id,
          full_name: "A. Author",
          affiliation: null,
          orcid: null,
          email: null,
          position: 0,
        },
        {
          article_id: a.id,
          full_name: "B. Author",
          affiliation: null,
          orcid: null,
          email: null,
          position: 1,
        },
      ]);
    case "rpc:categories_with_counts":
      return [
        {
          id: "c1",
          name: "Linguistics",
          slug: "linguistics",
          description: null,
          article_count: articleCount,
        },
      ];
    default:
      return [];
  }
}

function query(table: string) {
  queries.push(table);
  const result = { data: rows(table), error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "lte", "gt"]) builder[m] = () => builder;
  builder.single = () => Promise.resolve({ data: result.data[0] ?? null, error: null });
  builder.maybeSingle = builder.single;
  builder.then = (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    from: query,
    rpc: (name: string) => {
      queries.push(`rpc:${name}`);
      return Promise.resolve({ data: rows(`rpc:${name}`), error: null });
    },
  }),
}));
vi.mock("@/lib/env.public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" },
  siteUrl: "https://awlel.test",
}));

const catalog = await import("@/lib/data/catalog");

async function countFor(n: number, load: () => Promise<unknown>) {
  articleCount = n;
  queries.length = 0;
  await load();
  return [...queries];
}

beforeEach(() => {
  queries.length = 0;
});

describe("catalogue queries don't grow with the number of articles", () => {
  it("issue page", async () => {
    const one = await countFor(1, () => catalog.getIssue(25, 1));
    const many = await countFor(40, () => catalog.getIssue(25, 1));
    expect(many).toEqual(one);
    expect(one.length).toBeLessThanOrEqual(4);
  });

  it("category page", async () => {
    const one = await countFor(1, () => catalog.getCategoryArticles("linguistics"));
    const many = await countFor(40, () => catalog.getCategoryArticles("linguistics"));
    expect(many).toEqual(one);
  });

  it("latest articles (RSS) and popular lists", async () => {
    expect(await countFor(40, () => catalog.getLatestArticles(30))).toEqual(
      await countFor(1, () => catalog.getLatestArticles(30)),
    );
    expect(await countFor(40, () => catalog.getPopularArticles("views", 10))).toEqual(
      await countFor(1, () => catalog.getPopularArticles("views", 10)),
    );
  });
});

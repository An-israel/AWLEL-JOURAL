import { expect, test } from "@playwright/test";

// The public read-only API (item 102).
test("the v1 API lists issues and articles with citations, CORS and caching", async ({ request }) => {
  const index = await request.get("/api/v1");
  expect(index.ok()).toBe(true);
  expect(index.headers()["access-control-allow-origin"]).toBe("*");
  expect(index.headers()["x-api-version"]).toBe("1");

  const issues = await (await request.get("/api/v1/issues")).json();
  expect(issues.data.length).toBeGreaterThan(0);
  const first = issues.data[0];
  expect(first).toMatchObject({ volume: expect.any(Number), label: expect.stringContaining("Volume") });

  const issue = await request.get(first.api_url.replace(/^https?:\/\/[^/]+/, ""));
  expect(issue.headers()["cache-control"]).toContain("s-maxage=300");
  const { data } = await issue.json();
  expect(data.articles.length).toBeGreaterThan(0);

  const article = await (await request.get(`/api/v1/articles/${data.articles[0].slug}`)).json();
  expect(article.data).toMatchObject({ title: data.articles[0].title, cite: { apa: expect.any(String) } });
  expect(article.data.abstract).not.toContain("<");
  // Private author emails never appear unless the author chose to show them.
  expect(JSON.stringify(article.data)).not.toMatch(/"email":"[^"]*@/);

  const missing = await request.get("/api/v1/articles/no-such-article");
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: "not_found" } });
  expect((await request.get("/api/v1/articles?limit=500")).status()).toBe(400);
});

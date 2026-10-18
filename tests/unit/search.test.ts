import { describe, expect, it } from "vitest";
import { decodeEntities, isPrerenderAbort } from "@/lib/search-text";
import { plural } from "@/lib/plural";

describe("search helpers", () => {
  it("decodes entities left in snippets, and leaves unknown ones alone", () => {
    expect(decodeEntities("Achebe&#8217;s &ldquo;Arrow&rdquo; &amp; more&hellip;")).toBe(
      "Achebe’s “Arrow” & more…",
    );
    expect(decodeEntities("&#x2013; &notanentity; &#99999999;")).toBe("– &notanentity; &#99999999;");
  });

  it("recognises the background-prerender abort, and only that", () => {
    expect(
      isPrerenderAbort(new Error("During prerendering, fetch() rejects when the prerender is complete.")),
    ).toBe(true);
    expect(isPrerenderAbort(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(isPrerenderAbort(new Error("connection refused"))).toBe(false);
    expect(isPrerenderAbort({ message: "permission denied", code: "42501" })).toBe(false);
    expect(isPrerenderAbort(null)).toBe(false);
  });
});

describe("plural", () => {
  it("chooses the right form", () => {
    expect(plural(1, "article")).toBe("1 article");
    expect(plural(0, "article")).toBe("0 articles");
    expect(plural(1204, "view")).toBe("1,204 views");
    expect(plural(2, "category", "categories")).toBe("2 categories");
  });
});

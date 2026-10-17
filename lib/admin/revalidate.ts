import "server-only";
import { updateTag } from "next/cache";
import { TAGS } from "@/lib/data/tags";

/**
 * Expires the public pages an edit affects (item 50). `updateTag` gives
 * read-your-writes: the editor's next view, and every visitor's, gets fresh
 * data. The sitemap and RSS feed (milestone 7) read the same tags.
 */
export function expireCatalog(
  opts: {
    issueIds?: (string | null | undefined)[];
    articleIds?: (string | null | undefined)[];
    categories?: boolean;
  } = {},
) {
  updateTag(TAGS.issues);
  updateTag(TAGS.articles);
  if (opts.categories) updateTag(TAGS.categories);
  for (const id of opts.issueIds ?? []) if (id) updateTag(TAGS.issue(id));
  for (const id of opts.articleIds ?? []) if (id) updateTag(TAGS.article(id));
}

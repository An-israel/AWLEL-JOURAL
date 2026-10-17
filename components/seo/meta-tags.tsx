import type { MetaPair } from "@/lib/seo/scholarly-meta";

/**
 * Renders <meta name content> tags in the given order; React places them in
 * the document head. Used for the Google Scholar and Dublin Core tags, whose
 * order (author, then that author's institution) Next's metadata API can't
 * express.
 */
export function MetaTags({ tags }: { tags: MetaPair[] }) {
  return (
    <>
      {tags.map(([name, content], i) => (
        <meta key={`${name}-${i}`} name={name} content={content} />
      ))}
    </>
  );
}

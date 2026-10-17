import { serializeJsonLd } from "@/lib/seo/json-ld";

/** Structured data for search engines (section 11). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // The serializer escapes "<", so the data can't close the script element.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

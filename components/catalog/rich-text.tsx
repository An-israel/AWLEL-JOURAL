import { sanitizeRichText } from "@/lib/sanitize";

/** Renders stored rich text. Always sanitised here, whatever was saved. */
export function RichText({ html, className = "prose-reading" }: { html: string | null; className?: string }) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}

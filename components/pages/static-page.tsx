import type { ReactNode } from "react";
import { withHeadingIds } from "@/lib/headings";
import { sanitizeRichText } from "@/lib/sanitize";

/**
 * Layout for the editable static pages: editorial header, serif reading
 * column, and an aside with an "On this page" list plus page-specific extras.
 */
export function StaticPage({
  eyebrow,
  title,
  lead,
  content,
  aside,
  children,
  afterContent,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  content: string | null;
  aside?: ReactNode;
  children?: ReactNode;
  afterContent?: ReactNode;
}) {
  const { html, headings } = withHeadingIds(sanitizeRichText(content));

  return (
    <>
      <header className="bg-white">
        <div className="mx-auto max-w-site px-4 pt-14 pb-12 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">{eyebrow}</p>
          <h1 className="mt-2 max-w-4xl text-4xl sm:text-5xl">{title}</h1>
          <hr className="rule-gold mt-6 w-20" />
          {lead ? <div className="mt-6 max-w-3xl text-lg text-ink-muted">{lead}</div> : null}
        </div>
      </header>
      <div className="mx-auto grid max-w-site gap-12 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_18rem] lg:px-8">
        <div className="min-w-0">
          {html ? (
            <div className="prose-reading" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-ink-muted">This page is being updated. Please check back soon.</p>
          )}
          {afterContent}
        </div>
        <aside className="space-y-8 lg:sticky lg:top-36 lg:self-start">
          {headings.length > 2 ? (
            <nav aria-label="On this page" className="hidden lg:block">
              <h2 className="text-xs font-semibold tracking-[0.16em] text-ink-muted uppercase">
                On this page
              </h2>
              <ul className="mt-3 space-y-1 border-l border-line">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-sm text-ink-muted no-underline hover:border-gold hover:text-navy"
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {aside}
        </aside>
      </div>
      {children}
    </>
  );
}

export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 text-sm text-ink-muted">{children}</div>
    </section>
  );
}

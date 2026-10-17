"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when a page fails to render (items 59, 95). The reference is the
 * error digest Next writes to the server log, so a report can be matched to
 * the log line. Nothing about the error itself is shown to the visitor.
 */
export function ErrorPanel({
  error,
  reset,
  title,
  children,
  links,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  children: React.ReactNode;
  links: { href: string; label: string }[];
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-site px-4 py-20 sm:px-6 lg:px-8" role="alert">
      <p className="text-sm font-semibold tracking-[0.2em] text-coral-ink uppercase">Something went wrong</p>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{title}</h1>
      <hr className="rule-gold mt-8 w-24" />
      <div className="prose-reading mt-6 max-w-2xl text-ink-muted">{children}</div>
      {error.digest ? (
        <p className="mt-4 text-sm text-ink-muted">
          If you report this, please quote reference{" "}
          <code className="font-mono text-ink">{error.digest}</code>.
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-navy px-5 py-3 font-medium text-white hover:bg-royal"
        >
          Try again
        </button>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md border border-navy px-5 py-3 font-medium text-navy no-underline hover:bg-navy hover:text-white"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

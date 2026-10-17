import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "No access", robots: { index: false } };

export default function NoAccessPage() {
  return (
    <section className="mx-auto max-w-site px-4 py-24 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold tracking-[0.2em] text-coral-ink uppercase">Error 403</p>
      <h1 className="mt-4 text-4xl font-bold">You don&rsquo;t have access to this page</h1>
      <hr className="rule-gold mt-8 w-24" />
      <p className="prose-reading mt-6 text-ink-muted">
        Your account doesn&rsquo;t have permission to open that page. If you think it should, contact the
        editorial office.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/account"
          className="rounded-md bg-navy px-5 py-3 font-medium text-white no-underline hover:bg-royal"
        >
          Go to my account
        </Link>
        <Link href="/" className="px-2 py-3 font-medium">
          Home page
        </Link>
      </div>
    </section>
  );
}

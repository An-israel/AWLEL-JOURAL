import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MySubmissions } from "@/components/submissions/my-submissions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My submissions", robots: { index: false } };

async function Content() {
  const user = await requireUser("/account/submissions");
  return <MySubmissions userId={user.id} />;
}

export default function MySubmissionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <Link href="/account" className="text-sm">
        ← My account
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">My submissions</h1>
        <Link
          href="/submit"
          className="rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-royal"
        >
          Submit a manuscript
        </Link>
      </div>
      <hr className="rule-gold mt-6 w-20" />
      <div className="mt-6 rounded-lg border border-line bg-white px-5 py-2">
        <Suspense fallback={<div className="h-40 animate-pulse" aria-busy="true" />}>
          <Content />
        </Suspense>
      </div>
    </div>
  );
}

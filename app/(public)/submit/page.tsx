import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getCategoriesWithCounts } from "@/lib/data/catalog";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { SubmissionForm } from "./submission-form";

export const metadata: Metadata = { title: "Submit a manuscript", robots: { index: false } };

async function Content() {
  const user = await requireUser("/submit");
  const [flags, categories] = await Promise.all([getFeatureFlags(), getCategoriesWithCounts()]);

  if (user.role === "reviewer") {
    return (
      <p className="rounded-lg border border-line bg-white p-6 text-ink-muted">
        Reviewer accounts can&rsquo;t submit manuscripts. To submit your own work, register a separate author
        account or contact the editorial office.
      </p>
    );
  }
  if (!flags.submissions_open) {
    return (
      <div className="rounded-lg border border-gold bg-[#FBF3E4] p-6 text-[#7A4F18]">
        <p className="font-semibold">Submissions are closed at the moment.</p>
        <p className="mt-1">
          Please check back soon, or <Link href="/contact">contact the editorial office</Link>.
        </p>
      </div>
    );
  }
  return (
    <SubmissionForm
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      defaultAffiliation={user.affiliation ?? ""}
      authorName={user.fullName}
    />
  );
}

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">For authors</p>
      <h1 className="mt-2 text-4xl">Submit a manuscript</h1>
      <hr className="rule-gold mt-6 w-20" />
      <p className="prose-reading mt-6 text-ink-muted">
        Before you start, read the <Link href="/submission-guidelines">submission guidelines</Link>:
        manuscripts follow a set structure, use indented paragraphs and one citation style (MLA 8th or APA
        7th) throughout.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
          <Content />
        </Suspense>
      </div>
    </div>
  );
}

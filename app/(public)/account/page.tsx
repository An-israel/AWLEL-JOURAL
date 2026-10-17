import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { Toaster } from "@/components/ui/toaster";
import { signOut } from "@/app/(public)/(auth)/actions";
import { requireUser } from "@/lib/auth";
import { ADMIN_AREA_ROLES, ROLE_LABELS } from "@/lib/roles";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

async function Account() {
  const user = await requireUser("/account");
  const canUseAdmin = ADMIN_AREA_ROLES.includes(user.role);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">
            {ROLE_LABELS[user.role]}
          </p>
          <h1 className="mt-2 text-4xl">My account</h1>
          <p className="mt-2 text-ink-muted">Signed in as {user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseAdmin ? (
            <Link
              href="/admin"
              className="rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-royal"
            >
              Open the editorial dashboard
            </Link>
          ) : null}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-navy hover:border-navy"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <hr className="rule-gold mt-6 w-20" />

      <section aria-labelledby="subs-title" className="mt-10 rounded-lg border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="subs-title" className="text-lg font-semibold">
            My submissions
          </h2>
          <Link
            href="/submit"
            className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white no-underline hover:bg-royal"
          >
            Submit a manuscript
          </Link>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          You haven&rsquo;t submitted any manuscripts yet. Before you start, read the{" "}
          <Link href="/submission-guidelines">submission guidelines</Link>.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ProfileForm
          fullName={user.fullName}
          email={user.email}
          affiliation={user.affiliation}
          orcid={user.orcid}
        />
        <PasswordForm />
      </div>
      <Toaster />
    </>
  );
}

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Account />
      </Suspense>
    </div>
  );
}

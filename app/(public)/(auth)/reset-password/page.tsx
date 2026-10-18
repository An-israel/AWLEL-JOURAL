import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthCard } from "../auth-ui";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a password", robots: { index: false } };

type Props = PageProps<"/reset-password">;

// Reached from a password-reset or invitation email via /auth/callback or
// /auth/confirm, which have already signed the person in. The session is
// checked before the form is shown, so an expired link says so straight away
// instead of after the form is filled in (item 47).
async function Content({ searchParams }: Props) {
  await connection();
  const { welcome } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard title="This link has expired">
        <div className="space-y-5">
          <p role="alert" className="rounded-md bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C]">
            The link you followed has expired or has already been used, so we can&rsquo;t set a password with
            it. Links stay valid for a short time and work once.
          </p>
          <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Send a new link
          </Link>
          <p className="text-center text-sm">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </AuthCard>
    );
  }
  const invited = welcome === "1";
  return (
    <AuthCard
      title={invited ? "Choose your password" : "Choose a password"}
      intro={
        invited
          ? `Welcome to AWLEL. Choose the password you'll use to sign in as ${user.email}.`
          : "Set the password you'll use to sign in to AWLEL."
      }
    >
      <ResetForm />
    </AuthCard>
  );
}

export default function ResetPasswordPage(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto my-20 h-80 max-w-md animate-pulse rounded-xl bg-line" />}>
      <Content {...props} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../auth-ui";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an author account", robots: { index: false } };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard
      title="Create an account"
      intro="Author accounts let you submit manuscripts and follow their progress. Reviewers and editors are invited by the editorial office."
    >
      <Suspense>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <SignupForm />
    </AuthCard>
  );
}

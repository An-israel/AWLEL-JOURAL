import type { Metadata } from "next";
import { Suspense } from "react";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { AuthCard } from "../auth-ui";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const flags = await getFeatureFlags();
  return (
    <AuthCard title="Sign in" intro="For authors, reviewers and the editorial team.">
      <Suspense>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <LoginForm googleEnabled={Boolean(flags.google_sign_in)} />
    </AuthCard>
  );
}

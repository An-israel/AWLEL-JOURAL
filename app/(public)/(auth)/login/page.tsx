import type { Metadata } from "next";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { AuthCard } from "../auth-ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage() {
  const flags = await getFeatureFlags();
  return (
    <AuthCard title="Sign in" intro="For authors, reviewers and the editorial team.">
      <LoginForm googleEnabled={Boolean(flags.google_sign_in)} />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "../auth-ui";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a password", robots: { index: false } };

// Reached from a password-reset or invitation email via /auth/callback,
// which has already signed the person in.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a password" intro="Set the password you'll use to sign in to AWLEL.">
      <ResetForm />
    </AuthCard>
  );
}

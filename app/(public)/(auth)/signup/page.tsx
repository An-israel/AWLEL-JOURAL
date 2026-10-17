import type { Metadata } from "next";
import { AuthCard } from "../auth-ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an author account", robots: { index: false } };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create an account"
      intro="Author accounts let you submit manuscripts and follow their progress. Reviewers and editors are invited by the editorial office."
    >
      <SignupForm />
    </AuthCard>
  );
}

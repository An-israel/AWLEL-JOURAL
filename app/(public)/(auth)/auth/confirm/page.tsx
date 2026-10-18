import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../../auth-ui";
import { ConfirmLink } from "./confirm-link";

export const metadata: Metadata = { title: "Signing you in", robots: { index: false } };

// Finishes links that carry the session in the URL fragment (Supabase's
// default invitation email), which only the browser can read.
export default function ConfirmPage() {
  return (
    <AuthCard title="Just a moment">
      <Suspense>
        <ConfirmLink />
      </Suspense>
    </AuthCard>
  );
}

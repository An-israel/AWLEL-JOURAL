"use client";

import { ErrorPanel } from "@/components/site/error-panel";

// The admin's "service unavailable" state (item 95): if the database or
// storage can't be reached, editors see this instead of a broken page.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      error={error}
      reset={reset}
      title="The dashboard can't load this right now"
      links={[{ href: "/admin", label: "Dashboard" }]}
    >
      <p>
        The service behind the dashboard may be temporarily unavailable. Anything you saved before this
        message is safe: every save either completes fully or not at all. Wait a minute and try again.
      </p>
      <p className="mt-3">
        If it keeps happening, check Admin → Operations or status.supabase.com, and see “Site down or
        erroring” in the runbook.
      </p>
    </ErrorPanel>
  );
}

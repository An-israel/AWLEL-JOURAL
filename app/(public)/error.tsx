"use client";

import { ErrorPanel } from "@/components/site/error-panel";

export default function PublicError({
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
      title="This page couldn't be loaded"
      links={[
        { href: "/issues", label: "Browse the archive" },
        { href: "/", label: "Home page" },
      ]}
    >
      <p>
        This is usually a brief problem on our side. Please try again in a moment. Issues you have visited
        recently may still open from the archive.
      </p>
    </ErrorPanel>
  );
}

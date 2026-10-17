"use client";

import { Button } from "@/components/ui/button";

/** Shown when a save hits an optimistic-lock conflict (item 36). */
export function ConflictBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coral/40 bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C]"
    >
      <span>
        <strong>Someone else edited this.</strong> Reload to see their changes, then make yours again. Copy
        anything you don&rsquo;t want to lose first.
      </span>
      <Button size="sm" variant="outline" type="button" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

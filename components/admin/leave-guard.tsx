"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/dialog";

/*
 * "Leave without saving?" (item 71). One dialog for the whole admin, mounted
 * in the admin layout; forms ask it through `askToLeave`. Outside the admin
 * (the public submission form) there is no dialog, so the browser's own
 * confirm box is used instead.
 */

type Resolve = (leave: boolean) => void;
let openDialog: ((resolve: Resolve) => void) | null = null;

const QUESTION = "Leave without saving? Your changes on this page will be lost.";

/** Resolves true when the person chooses to leave and lose their changes. */
export function askToLeave(): Promise<boolean> {
  if (!openDialog) return Promise.resolve(window.confirm(QUESTION));
  const show = openDialog;
  return new Promise((resolve) => show(resolve));
}

export function LeaveGuardDialog() {
  const [pending, setPending] = useState<Resolve | null>(null);

  useEffect(() => {
    openDialog = (resolve) =>
      setPending((previous: Resolve | null) => {
        // A second question replaces an unanswered one, which counts as "stay".
        previous?.(false);
        return resolve;
      });
    return () => {
      openDialog = null;
    };
  }, []);

  const answer = (leave: boolean) => {
    pending?.(leave);
    setPending(null);
  };

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && answer(false)}
      title="Leave without saving?"
      description="You have changes on this page that aren't saved yet. If you leave now, they will be lost."
      confirmLabel="Leave without saving"
      destructive
      onConfirm={() => answer(true)}
    />
  );
}

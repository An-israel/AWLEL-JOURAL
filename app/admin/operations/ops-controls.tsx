"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import type { ActionResult } from "@/lib/admin/result";
import { removeSuppression, resolveDeadLetter, runTaskNow } from "./actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.message);
      router.refresh();
    });
  return { pending, run };
}

export function RunTaskButton({ task, label }: { task: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runTaskNow(task))}>
      {pending ? "Running…" : `Run ${label.toLowerCase()} now`}
    </Button>
  );
}

export function DeadLetterButtons({ id, jobLabel }: { id: number; jobLabel?: string }) {
  const { pending, run } = useAction();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <span className="flex gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => resolveDeadLetter(id, "retried"))}
      >
        Retry
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmDiscard(true)}>
        Discard
      </Button>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this failed job?"
        description={`${jobLabel ? `The job “${jobLabel}”` : "The job"} won't be tried again, so whatever it was doing (for example sending an email) will not happen. Use Retry instead if it should still run. This can't be undone.`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => run(() => resolveDeadLetter(id, "discarded"))}
      />
    </span>
  );
}

export function UnsuppressButton({ email }: { email: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeSuppression(email))}>
      Allow again
    </Button>
  );
}

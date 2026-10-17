"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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

export function DeadLetterButtons({ id }: { id: number }) {
  const { pending, run } = useAction();
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
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => resolveDeadLetter(id, "discarded"))}
      >
        Discard
      </Button>
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

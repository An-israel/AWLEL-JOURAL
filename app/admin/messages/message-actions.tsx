"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { updateMessage } from "./actions";

export function MessageActions({ id, isRead, deleted }: { id: string; isRead: boolean; deleted: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const marked = useRef(false);

  // Opening an unread message marks it read.
  useEffect(() => {
    if (!isRead && !deleted && !marked.current) {
      marked.current = true;
      void updateMessage({ id, isRead: true });
    }
  }, [id, isRead, deleted]);

  const run = (patch: { isRead?: boolean; deleted?: boolean }, after?: () => void) =>
    start(async () => {
      const r = await updateMessage({ id, ...patch });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message ?? "Done");
      if (after) after();
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {deleted ? (
        <Button variant="outline" disabled={pending} onClick={() => run({ deleted: false })}>
          Restore
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run({ isRead: false }, () => router.push("/admin/messages"))}
          >
            Mark as unread
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run({ deleted: true }, () => router.push("/admin/messages"))}
          >
            Move to trash
          </Button>
        </>
      )}
    </div>
  );
}

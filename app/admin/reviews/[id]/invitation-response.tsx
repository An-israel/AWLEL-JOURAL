"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { respondToInvitation } from "../actions";

/** Accept or decline the invitation to review (item 60). */
export function InvitationResponse({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const respond = (accept: boolean) =>
    start(async () => {
      const r = await respondToInvitation({ assignmentId, accept, reason });
      if (!r.ok) return void toast.error(r.message);
      setDeclining(false);
      toast.success(r.message ?? "Thank you");
      router.push(accept ? `/admin/reviews/${assignmentId}` : "/admin/reviews");
      router.refresh();
    });

  return (
    <section
      aria-labelledby="inv-title"
      className="mt-6 rounded-lg border border-navy/30 bg-[#E8EDFA] px-5 py-4 text-sm text-navy"
    >
      <h2 id="inv-title" className="text-base font-semibold">
        Can you review this manuscript?
      </h2>
      <p className="mt-1">
        Please let the editors know. Read the abstract below first if you like; if you can&rsquo;t take it on,
        declining lets them invite someone else quickly.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => respond(true)}>
          Accept
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
          Decline
        </Button>
      </div>
      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader
            title="Decline this invitation?"
            description="You'll no longer have access to the manuscript, and the editors will be told."
          />
          <div>
            <Label htmlFor="inv-reason">Reason (optional)</Label>
            <Textarea
              id="inv-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5"
              placeholder="For example, a conflict of interest, or no time before the due date. You could suggest another reviewer."
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => respond(false)}>
              Decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

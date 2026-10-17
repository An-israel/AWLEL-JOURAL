"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { inviteUser, type InviteState } from "./actions";

const initial: InviteState = { status: "idle" };

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: InviteState, fd: FormData) => {
    const result = await inviteUser(prev, fd);
    if (result.status === "success") {
      toast.success(result.message ?? "Invitation sent");
      setOpen(false);
      return initial;
    }
    return result;
  }, initial);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader
          title="Invite a user"
          description="They'll receive an email with a link to set their password. Authors can also register themselves."
        />
        <form action={action} className="space-y-4" noValidate>
          {state.status === "error" && state.message ? (
            <p role="alert" className="rounded-md bg-[#FDECEF] px-3 py-2 text-sm text-[#A3283C]">
              {state.message}
            </p>
          ) : null}
          <div>
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              name="fullName"
              className="mt-1.5"
              aria-describedby="invite-name-error"
              aria-invalid={state.fieldErrors?.fullName ? true : undefined}
            />
            <FieldError id="invite-name-error">{state.fieldErrors?.fullName}</FieldError>
          </div>
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              className="mt-1.5"
              aria-describedby="invite-email-error"
              aria-invalid={state.fieldErrors?.email ? true : undefined}
            />
            <FieldError id="invite-email-error">{state.fieldErrors?.email}</FieldError>
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <NativeSelect id="invite-role" name="role" defaultValue="reviewer" className="mt-1.5">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

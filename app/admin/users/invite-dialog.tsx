"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ROLE_DESCRIPTIONS } from "@/lib/admin/role-help";
import { ROLE_LABELS, ROLES, type UserRole } from "@/lib/roles";
import { inviteUser, type InviteState } from "./actions";

const initial: InviteState = { status: "idle" };

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  // A fresh form (and a cleared error) every time the dialog opens (item 85).
  const [round, setRound] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRound((n) => n + 1);
      }}
    >
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
        <InviteForm key={round} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: InviteState, fd: FormData) => {
    const result = await inviteUser(prev, fd);
    if (result.status === "success") {
      toast.success(result.message ?? "Invitation sent");
      onDone();
      return initial;
    }
    return result;
  }, initial);
  // The form is reset after each submission, so what was typed comes back
  // from the server with the error instead of being lost.
  const values = state.values;
  const [role, setRole] = useState<UserRole>(values?.role ?? "reviewer");
  // The reset puts the select back on its first option while `role` keeps the
  // choice; show the choice again once the reset has happened.
  const roleSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (roleSelect.current) roleSelect.current.value = role;
  }, [state, role]);

  return (
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
          defaultValue={values?.fullName}
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
          defaultValue={values?.email}
          className="mt-1.5"
          aria-describedby="invite-email-error"
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
        <FieldError id="invite-email-error">{state.fieldErrors?.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="invite-role">Role</Label>
        <NativeSelect
          id="invite-role"
          name="role"
          ref={roleSelect}
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="mt-1.5"
          aria-describedby="invite-role-hint"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
        <p id="invite-role-hint" className="mt-1 text-xs text-ink-muted">
          {ROLE_DESCRIPTIONS[role]}
        </p>
        <details className="mt-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium text-navy">What can each role do?</summary>
          <ul className="mt-1.5 space-y-1">
            {[...ROLES].reverse().map((r) => (
              <li key={r}>
                <strong className="text-ink">{ROLE_LABELS[r]}:</strong> {ROLE_DESCRIPTIONS[r]}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

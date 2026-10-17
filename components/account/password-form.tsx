"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/(public)/(auth)/actions";
import type { FormState } from "@/app/(public)/(auth)/schemas";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

const initial: FormState = { status: "idle" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-line bg-white p-6" noValidate>
      <h2 className="text-lg font-semibold">Change password</h2>
      {state.message ? (
        <p role="alert" className="rounded-md bg-[#FDECEF] px-3 py-2 text-sm text-[#A3283C]">
          {state.message}
        </p>
      ) : null}
      {(
        [
          ["password", "New password"],
          ["confirm", "Confirm new password"],
        ] as const
      ).map(([name, label]) => (
        <div key={name}>
          <Label htmlFor={`pw-${name}`}>{label}</Label>
          <Input
            id={`pw-${name}`}
            name={name}
            type="password"
            autoComplete="new-password"
            className="mt-1.5"
            aria-invalid={state.fieldErrors?.[name] ? true : undefined}
            aria-describedby={state.fieldErrors?.[name] ? `pw-${name}-error` : undefined}
          />
          <FieldError id={`pw-${name}-error`}>{state.fieldErrors?.[name]}</FieldError>
        </div>
      ))}
      <p className="text-xs text-ink-muted">At least 10 characters, with letters and numbers.</p>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}

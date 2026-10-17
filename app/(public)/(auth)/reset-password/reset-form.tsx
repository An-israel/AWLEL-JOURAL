"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updatePassword } from "../actions";
import { AuthField, FormMessage } from "../auth-ui";
import type { FormState } from "../schemas";

const initial: FormState = { status: "idle" };

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <AuthField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        state={state}
        hint="At least 10 characters, with letters and numbers."
      />
      <AuthField
        name="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        state={state}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

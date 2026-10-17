"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "../actions";
import { AuthField, FormMessage } from "../auth-ui";
import type { FormState } from "../schemas";

const initial: FormState = { status: "idle" };

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {state.status !== "success" ? (
        <>
          <AuthField name="email" label="Email address" type="email" autoComplete="email" state={state} />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </>
      ) : null}
      <p className="text-center text-sm">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signUp } from "../actions";
import { AuthField, FormMessage, NextField } from "../auth-ui";
import type { FormState } from "../schemas";

const initial: FormState = { status: "idle" };

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Suspense>
        <NextField />
      </Suspense>
      <FormMessage state={state} />
      <AuthField name="fullName" label="Full name" autoComplete="name" state={state} />
      <AuthField name="email" label="Email address" type="email" autoComplete="email" state={state} />
      <AuthField
        name="affiliation"
        label="Institution (optional)"
        autoComplete="organization"
        state={state}
        required={false}
      />
      <AuthField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        state={state}
        hint="At least 10 characters, with letters and numbers."
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create author account"}
      </Button>
      <p className="border-t border-line pt-5 text-center text-sm text-ink-muted">
        Already registered?{" "}
        <Link href="/login" className="font-semibold">
          Sign in
        </Link>
      </p>
    </form>
  );
}

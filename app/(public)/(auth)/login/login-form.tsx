"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signIn, signInWithGoogle } from "../actions";
import { AuthField, FormMessage, LinkError, NextField, ResendConfirmation } from "../auth-ui";
import type { FormState } from "../schemas";

const initial: FormState = { status: "idle" };

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <div className="space-y-5">
      <Suspense>
        <LinkError />
      </Suspense>
      <form action={action} className="space-y-4" noValidate>
        <Suspense>
          <NextField />
        </Suspense>
        <FormMessage state={state} />
        <AuthField name="email" label="Email address" type="email" autoComplete="email" state={state} />
        <AuthField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          state={state}
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {state.resend && state.values?.email ? <ResendConfirmation email={state.values.email} /> : null}
      {googleEnabled ? (
        <form action={signInWithGoogle}>
          <Suspense>
            <NextField />
          </Suspense>
          <div className="my-4 flex items-center gap-3 text-xs text-ink-muted uppercase">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Sign in with Google
          </Button>
        </form>
      ) : null}
      <p className="border-t border-line pt-5 text-center text-sm text-ink-muted">
        New author?{" "}
        <Link href="/signup" className="font-semibold">
          Create an account
        </Link>
      </p>
    </div>
  );
}

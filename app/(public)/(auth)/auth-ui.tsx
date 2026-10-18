"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { resendConfirmation } from "./actions";
import type { FormState } from "./schemas";

export function AuthField({
  name,
  label,
  type = "text",
  autoComplete,
  state,
  hint,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  state: FormState;
  hint?: string;
  required?: boolean;
}) {
  const id = `auth-${name}`;
  const error = state.fieldErrors?.[name];
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={type === "password" ? undefined : state.values?.[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1.5 h-11 text-base"
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const success = state.status === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      className={`rounded-md px-4 py-3 text-sm ${success ? "bg-[#EAF5E6] text-[#2F6B22]" : "bg-[#FDECEF] text-[#A3283C]"}`}
    >
      {state.message}
    </div>
  );
}

/** Carries `?next=` through the form so people return where they started. */
export function NextField() {
  const next = useSearchParams().get("next") ?? "";
  return <input type="hidden" name="next" value={next} />;
}

/** Messages for /login?error=… set by the auth callback and /auth/confirm. */
export const LINK_ERRORS: Record<string, string> = {
  link: "That link is invalid or has expired. Please request a new one.",
  expired:
    "That link has expired or has already been used. If you were confirming your email, try signing in: it may already be confirmed. Otherwise, request a new link.",
  other_device:
    "Your email address is confirmed. To finish, open the link in the same browser you signed up with, or simply sign in below.",
  other_device_reset:
    "Open the reset link in the same browser where you asked for it, or request a new link below.",
  inactive: "This account has been deactivated. Contact the editorial office if you think this is a mistake.",
  oauth: "Sign-in with Google is not available right now. Please use your email and password.",
};

export function LinkError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  const success = error === "other_device";
  return (
    <div
      role={success ? "status" : "alert"}
      className={`rounded-md px-4 py-3 text-sm ${success ? "bg-[#EAF5E6] text-[#2F6B22]" : "bg-[#FDECEF] text-[#A3283C]"}`}
    >
      {LINK_ERRORS[error] ?? LINK_ERRORS.link}
    </div>
  );
}

/** "Resend the confirmation email" (item 45), for the sign-in error and the post-sign-up screen. */
export function ResendConfirmation({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(resendConfirmation, { status: "idle" } as FormState);
  return (
    <form action={action} className="space-y-3 rounded-md border border-line bg-paper p-4" noValidate>
      <p className="text-sm text-ink-muted">Didn&rsquo;t get the email, or the link has expired?</p>
      <FormMessage state={state} />
      {email ? (
        <input type="hidden" name="email" value={state.values?.email ?? email} />
      ) : (
        <AuthField name="email" label="Email address" type="email" autoComplete="email" state={state} />
      )}
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Resend the confirmation email"}
      </Button>
    </form>
  );
}

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden px-4 py-14 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 opacity-90 lg:block"
        style={{ clipPath: "polygon(45% 0, 100% 0, 100% 100%, 0 100%)" }}
      >
        <div className="accent-bands h-full w-full" />
      </div>
      <div className="relative mx-auto w-full max-w-md rounded-xl border border-line bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-3xl">{title}</h1>
        <hr className="rule-gold mt-4 w-14" />
        {intro ? <div className="mt-4 text-sm text-ink-muted">{intro}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

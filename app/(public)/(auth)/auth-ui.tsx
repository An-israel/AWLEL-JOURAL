"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { FieldError, Input, Label } from "@/components/ui/input";
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

export function LinkError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C]">
      {error === "link"
        ? "That link is invalid or has expired. Please request a new one."
        : "Sign-in with Google is not available right now. Please use your email and password."}
    </div>
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

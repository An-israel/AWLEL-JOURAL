"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { submitContact } from "./actions";
import type { ContactFields, ContactState } from "./schema";

const initial: ContactState = { status: "idle" };

function Field({
  name,
  label,
  error,
  defaultValue,
  textarea,
  type = "text",
  autoComplete,
}: {
  name: keyof ContactFields;
  label: string;
  error?: string;
  defaultValue?: string;
  textarea?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  const id = `contact-${name}`;
  const common = {
    id,
    name,
    required: true,
    defaultValue,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    className: `mt-1.5 block w-full rounded-md border bg-white px-3.5 py-2.5 text-ink ${
      error ? "border-coral-ink" : "border-line focus-visible:border-royal"
    }`,
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {textarea ? (
        <textarea {...common} rows={7} maxLength={10_000} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} maxLength={name === "email" ? 320 : 300} />
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-coral-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);
  const startedAt = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);
  const status = useRef<HTMLDivElement>(null);

  // Records when the visitor started filling in the form (bot time-trap).
  // React resets the form after every attempt, which would put the hidden
  // field back to 0, so it is restored after each one too.
  useEffect(() => {
    openedAt.current ||= state.startedAt ?? Date.now();
    if (startedAt.current) startedAt.current.value = String(openedAt.current);
    if (state.status !== "idle") status.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        ref={status}
        tabIndex={-1}
        role="status"
        className="rounded-lg border border-line bg-white p-8 outline-none"
      >
        <CheckCircle2 aria-hidden className="size-8 text-[#2F6B22]" />
        <h2 className="mt-3 text-2xl">Thank you — your message has been sent</h2>
        <p className="mt-2 text-ink-muted">The editorial office will reply to the email address you gave.</p>
      </div>
    );
  }

  const v = state.values ?? {};
  return (
    <form action={action} noValidate className="space-y-5 rounded-lg border border-line bg-white p-6 sm:p-8">
      <h2 className="text-2xl">Send us a message</h2>
      {state.status === "error" ? (
        <div
          ref={status}
          tabIndex={-1}
          role="alert"
          className="rounded-md bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C] outline-none"
        >
          {state.message}
        </div>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="name"
          label="Your name"
          autoComplete="name"
          error={state.fieldErrors?.name}
          defaultValue={v.name}
        />
        <Field
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
          defaultValue={v.email}
        />
      </div>
      <Field name="subject" label="Subject" error={state.fieldErrors?.subject} defaultValue={v.subject} />
      <Field
        name="message"
        label="Message"
        textarea
        error={state.fieldErrors?.message}
        defaultValue={v.message}
      />

      {/* Honeypot: hidden from people and assistive technology, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input ref={startedAt} type="hidden" name="started_at" defaultValue={state.startedAt ?? 0} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-ink-muted">
          We use your details only to reply to you. See our{" "}
          <a href="/privacy" className="underline">
            privacy policy
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy px-6 py-3 font-medium text-white hover:bg-royal disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

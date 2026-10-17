"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { updateProfile, type ProfileState } from "@/lib/actions/profile";

const initial: ProfileState = { status: "idle" };

export function ProfileForm({
  fullName,
  email,
  affiliation,
  orcid,
}: {
  fullName: string;
  email: string;
  affiliation: string | null;
  orcid: string | null;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "Saved");
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message ?? "Something went wrong");
  }, [state]);

  const field = (name: string, label: string, value: string | null, hint?: string) => (
    <div>
      <Label htmlFor={`profile-${name}`}>{label}</Label>
      <Input
        id={`profile-${name}`}
        name={name}
        defaultValue={value ?? ""}
        className="mt-1.5"
        aria-invalid={state.fieldErrors?.[name] ? true : undefined}
        aria-describedby={state.fieldErrors?.[name] ? `profile-${name}-error` : undefined}
        placeholder={hint}
      />
      <FieldError id={`profile-${name}-error`}>{state.fieldErrors?.[name]}</FieldError>
    </div>
  );

  return (
    <form action={action} className="space-y-4 rounded-lg border border-line bg-white p-6" noValidate>
      <h2 className="text-lg font-semibold">Profile</h2>
      {field("fullName", "Full name", fullName)}
      <div>
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email} disabled readOnly className="mt-1.5" />
        <p className="mt-1.5 text-xs text-ink-muted">To change your email, contact the editorial office.</p>
      </div>
      {field("affiliation", "Institution / affiliation", affiliation)}
      {field("orcid", "ORCID iD (optional)", orcid, "0000-0000-0000-0000")}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

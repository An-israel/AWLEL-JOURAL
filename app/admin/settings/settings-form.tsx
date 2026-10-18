"use client";

import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { FileSlot } from "@/components/admin/file-slot";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { featureEffect, featureName } from "@/lib/admin/feature-names";
import { SITE_ENTITY_IDS } from "@/lib/admin/file-slots";
import type { AttachedFile } from "@/lib/admin/uploads";
import { saveSettings, setFeatureFlag } from "./actions";

export interface SettingsData {
  version: number;
  journalName: string;
  shortName: string;
  subtitle: string;
  issn: string;
  publisher: string;
  contactEmail: string;
  postalAddress: string;
  publicationFrequency: string;
  social: { x: string; facebook: string; linkedin: string; website: string };
  logo: AttachedFile | null;
  ogImage: AttachedFile | null;
}

export interface Flag {
  key: string;
  enabled: boolean;
  description: string;
}

export function SettingsForm({ settings, flags }: { settings: SettingsData; flags: Flag[] }) {
  const [form, setForm] = useState(settings);
  const [version, setVersion] = useState(settings.version);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [flagState, setFlagState] = useState(flags);
  // Feature switches change the public site at once, so ask first (item 87).
  const [switching, setSwitching] = useState<Flag | null>(null);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty);

  const field = (
    key: Exclude<keyof SettingsData, "version" | "social" | "logo" | "ogImage">,
    label: string,
    hint?: string,
  ) => (
    <div>
      <Label htmlFor={`s-${key}`}>{label}</Label>
      <Input
        id={`s-${key}`}
        value={form[key]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [key]: e.target.value }));
          setDirty(true);
        }}
        className="mt-1.5"
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={`s-${key}-error`}
        placeholder={hint}
      />
      <FieldError id={`s-${key}-error`}>{errors[key]}</FieldError>
    </div>
  );

  return (
    <div className="mt-6 space-y-8">
      <ConflictBanner show={conflict} />
      <form
        className="space-y-5 rounded-lg border border-line bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveSettings({ ...form, expectedVersion: version });
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              if (r.conflict) setConflict(true);
              return void toast.error(r.message);
            }
            if (r.data) setVersion(r.data.version);
            setErrors({});
            setDirty(false);
            toast.success(r.message ?? "Saved");
          });
        }}
      >
        <h2 className="text-lg font-semibold">Journal details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {field("journalName", "Journal name")}
          {field("shortName", "Short name")}
          <div className="md:col-span-2">{field("subtitle", "Subtitle")}</div>
          {field("issn", "ISSN")}
          {field("contactEmail", "Contact email")}
          <div className="md:col-span-2">{field("publisher", "Publisher")}</div>
          {field(
            "publicationFrequency",
            "Publication frequency",
            "e.g. One volume a year, in one or two issues",
          )}
          <div className="md:col-span-2">
            <Label htmlFor="s-address">Postal address</Label>
            <Textarea
              id="s-address"
              rows={2}
              value={form.postalAddress}
              onChange={(e) => {
                setForm((f) => ({ ...f, postalAddress: e.target.value }));
                setDirty(true);
              }}
              className="mt-1.5"
            />
          </div>
        </div>
        <h3 className="pt-2 font-semibold">Social links</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {(["x", "facebook", "linkedin", "website"] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`s-social-${k}`}>
                {k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}
              </Label>
              <Input
                id={`s-social-${k}`}
                value={form.social[k]}
                placeholder="https://"
                onChange={(e) => {
                  setForm((f) => ({ ...f, social: { ...f.social, [k]: e.target.value } }));
                  setDirty(true);
                }}
                className="mt-1.5"
                aria-describedby={`s-social-${k}-error`}
              />
              <FieldError id={`s-social-${k}-error`}>{errors[`social.${k}`]}</FieldError>
            </div>
          ))}
        </div>
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <section className="space-y-3" aria-labelledby="brand-title">
        <h2 id="brand-title" className="text-lg font-semibold">
          Logo and sharing image
        </h2>
        <p className="text-sm text-ink-muted">
          The sharing image is used when a page without its own image is shared on social media (1200 × 630
          works best).
        </p>
        <FileSlot
          slot="site_logo"
          entityId={SITE_ENTITY_IDS.site_logo!}
          version={version}
          onVersion={setVersion}
          current={settings.logo}
        />
        <FileSlot
          slot="site_og_image"
          entityId={SITE_ENTITY_IDS.site_og_image!}
          version={version}
          onVersion={setVersion}
          current={settings.ogImage}
        />
      </section>

      <section className="space-y-3" aria-labelledby="flags-title">
        <h2 id="flags-title" className="text-lg font-semibold">
          Features
        </h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {flagState.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <label htmlFor={`flag-${f.key}`} className="min-w-0 text-sm">
                <span className="block font-medium text-ink">{featureName(f.key)}</span>
                <span className="text-ink-muted">{f.description}</span>
              </label>
              <button
                id={`flag-${f.key}`}
                type="button"
                role="switch"
                aria-checked={f.enabled}
                disabled={pending}
                onClick={() => setSwitching(f)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${f.enabled ? "bg-navy" : "bg-line"}`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${f.enabled ? "left-5.5" : "left-0.5"}`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={switching !== null}
        onOpenChange={(o) => !o && setSwitching(null)}
        title={switching ? `Turn ${switching.enabled ? "off" : "on"} “${featureName(switching.key)}”?` : ""}
        description={
          switching
            ? `${featureEffect(switching.key, !switching.enabled, switching.description)} This changes the public site straight away.`
            : ""
        }
        confirmLabel={switching?.enabled ? "Turn off" : "Turn on"}
        destructive={switching?.enabled}
        onConfirm={() => {
          const f = switching;
          setSwitching(null);
          if (!f) return;
          start(async () => {
            const r = await setFeatureFlag({ key: f.key, enabled: !f.enabled });
            if (!r.ok) return void toast.error(r.message);
            setFlagState((list) => list.map((x) => (x.key === f.key ? { ...x, enabled: !x.enabled } : x)));
            toast.success(r.message ?? "Saved");
          });
        }}
      />
    </div>
  );
}

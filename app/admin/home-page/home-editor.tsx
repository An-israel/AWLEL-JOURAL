"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { HOME_DEFAULTS, type HomeContent } from "@/lib/home-content";
import { saveHomeContent } from "./actions";

type Section = keyof HomeContent;

/** What the empty "use Settings" fields fall back to, shown as hints. */
export interface FromSettings {
  subtitle: string;
  journalName: string;
  badges: string;
}

export function HomeEditor({
  initial,
  version: initialVersion,
  fromSettings,
}: {
  initial: HomeContent;
  version: number;
  fromSettings: FromSettings;
}) {
  const [content, setContent] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty);

  function set<S extends Section>(section: S, key: keyof HomeContent[S], value: string | boolean) {
    setContent((c) => ({ ...c, [section]: { ...c[section], [key]: value } }));
    setDirty(true);
  }

  /** A one-line text box. */
  const text = <S extends Section>(
    section: S,
    key: keyof HomeContent[S] & string,
    label: string,
    hint?: string,
    placeholder?: string,
  ) => {
    const id = `h-${section}-${key}`;
    const path = `content.${section}.${key}`;
    return (
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={content[section][key] as string}
          placeholder={placeholder}
          onChange={(e) => set(section, key, e.target.value)}
          className="mt-1.5"
          aria-invalid={errors[path] ? true : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {hint ? (
          <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
        <FieldError id={`${id}-error`}>{errors[path]}</FieldError>
      </div>
    );
  };

  /** A paragraph box. */
  const paragraph = <S extends Section>(section: S, key: keyof HomeContent[S] & string, label: string) => {
    const id = `h-${section}-${key}`;
    const path = `content.${section}.${key}`;
    return (
      <div className="md:col-span-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          rows={4}
          value={content[section][key] as string}
          onChange={(e) => set(section, key, e.target.value)}
          className="mt-1.5"
          aria-invalid={errors[path] ? true : undefined}
        />
        <FieldError id={`${id}-error`}>{errors[path]}</FieldError>
      </div>
    );
  };

  /** "Show this section on the home page". */
  const shown = (section: "latest" | "subjects" | "about" | "recent" | "cta") => (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        checked={content[section].show}
        onChange={(e) => set(section, "show", e.target.checked)}
        className="size-4 accent-navy"
      />
      Show this section on the home page
    </label>
  );

  const save = () =>
    start(async () => {
      const r = await saveHomeContent({ expectedVersion: version, content });
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

  return (
    <div className="mt-6 space-y-6">
      <ConflictBanner show={conflict} />

      <Card
        title="Top of the page"
        description="The large title, the introduction and the two buttons, next to the latest issue's cover."
      >
        {text(
          "hero",
          "eyebrow",
          "Small line above the title",
          "Leave empty to use the subtitle from Settings.",
          fromSettings.subtitle,
        )}
        {text(
          "hero",
          "title",
          "Title",
          "Leave empty to use the journal's name from Settings.",
          fromSettings.journalName,
        )}
        {paragraph("hero", "intro", "Introduction")}
        {text(
          "hero",
          "badges",
          "Line under the introduction",
          "Leave empty to show the ISSN and “Peer reviewed” (and “Open access” once a licence is set in Settings).",
          fromSettings.badges,
        )}
        {text("hero", "readButton", "First button (opens the latest issue)")}
        {text("hero", "submitButton", "Second button (opens Submit a manuscript)")}
        {text(
          "hero",
          "coverCaption",
          "Label under the cover",
          "The issue's name follows it, e.g. “Latest issue · Volume 26, Issue 1”.",
        )}
      </Card>

      <Card title="Latest issue" description="The contents of the newest issue." toggle={shown("latest")}>
        {text("latest", "eyebrow", "Small heading", "The issue's name is the large heading below it.")}
        {text("latest", "actionLabel", "Link to the issue")}
        {paragraph("latest", "empty", "Message while the issue has no articles")}
      </Card>

      <Card
        title="Subjects"
        description="The subject areas that have published articles."
        toggle={shown("subjects")}
      >
        {text("subjects", "eyebrow", "Small heading")}
        {text("subjects", "title", "Heading")}
        {text("subjects", "actionLabel", "Link to all subjects")}
      </Card>

      <Card
        title="Most read and most downloaded"
        description="Shown once articles have readers. Switch the lists off in Settings → Feature switches."
      >
        {text("popular", "eyebrow", "Small heading")}
        {text("popular", "mostRead", "Heading of the most read list")}
        {text("popular", "mostDownloaded", "Heading of the most downloaded list")}
      </Card>

      <Card
        title="About the journal"
        description="A short introduction to the journal."
        toggle={shown("about")}
      >
        {text("about", "eyebrow", "Small heading")}
        {text("about", "title", "Heading")}
        <div className="md:col-span-2">
          <p id="h-about-body-label" className="text-sm font-medium text-ink">
            Text
          </p>
          <div className="mt-1.5">
            <RichTextEditor
              id="h-about-body"
              labelledBy="h-about-body-label"
              value={content.about.body}
              onChange={(v) => set("about", "body", v)}
              allowHeadings={false}
              minHeight="10rem"
            />
          </div>
          <FieldError id="h-about-body-error">{errors["content.about.body"]}</FieldError>
        </div>
        {text("about", "linkLabel", "Link to the About page")}
      </Card>

      <Card
        title="Recent issues"
        description="The four newest covers, beside the About text."
        toggle={shown("recent")}
      >
        {text("recent", "title", "Heading")}
        {text("recent", "linkLabel", "Link to the archive")}
      </Card>

      <Card
        title="Publish with AWLEL box"
        description="The dark blue box for authors at the bottom."
        toggle={shown("cta")}
      >
        {text("cta", "eyebrow", "Small heading")}
        {text("cta", "title", "Heading")}
        {paragraph("cta", "body", "Text")}
        {text("cta", "submitButton", "First button (opens Submit a manuscript)")}
        {text("cta", "guidelinesButton", "Second button (opens the Submission Guidelines)")}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save and publish"}
        </Button>
        {dirty ? <span className="text-sm text-ink-muted">Unsaved changes</span> : null}
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy"
        >
          <ExternalLink aria-hidden className="size-4" />
          View the home page
        </a>
        <span className="ml-auto">
          <ConfirmDialog
            trigger={<Button variant="outline">Restore the original wording</Button>}
            title="Restore the original wording?"
            description="Every field goes back to the wording the site started with, and every section is shown again. Nothing changes on the site until you press Save and publish."
            confirmLabel="Restore"
            onConfirm={() => {
              setContent(structuredClone(HOME_DEFAULTS));
              setDirty(true);
            }}
          />
        </span>
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  toggle,
  children,
}: {
  title: string;
  description: string;
  toggle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        {toggle}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

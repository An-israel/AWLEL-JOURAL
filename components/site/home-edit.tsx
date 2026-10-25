"use client";

import { Check, Pencil, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { loadHomeForEditing, saveHomeContent } from "@/app/admin/home-page/actions";
import { useSignedIn } from "@/components/site/account-link";
import type { HomeContent } from "@/lib/home-content";

/*
 * "Edit this page" on the home page: a Super Admin clicks any text and types
 * over it, then saves. The page itself stays static and cached; the button
 * appears only after the browser has a session and the server confirms the
 * role, and saving goes through the same checked action as Admin → Home page.
 */

type Section = keyof HomeContent;

interface EditState {
  editing: boolean;
  /** Bumped on every start, so the editable boxes start from the page's text. */
  session: number;
  change: (section: Section, field: string, value: string) => void;
}

const EditContext = createContext<EditState>({ editing: false, session: 0, change: () => {} });

export function HomeEditProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { signedIn } = useSignedIn();
  const [allowed, setAllowed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [session, setSession] = useState(0);
  const [changed, setChanged] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const draft = useRef<{ version: number; content: HomeContent } | null>(null);

  // Only signed-in visitors ask the server whether they may edit.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    loadHomeForEditing()
      .then((r) => live && setAllowed(r !== null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!editing || !changed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, changed]);

  const begin = () =>
    start(async () => {
      setMessage(null);
      const r = await loadHomeForEditing();
      if (!r) return setMessage({ ok: false, text: "Only Super Admins can edit the home page." });
      draft.current = r;
      setChanged(false);
      setSession((s) => s + 1);
      setEditing(true);
    });

  const change = (section: Section, field: string, value: string) => {
    if (!draft.current) return;
    const content = draft.current.content;
    draft.current.content = { ...content, [section]: { ...content[section], [field]: value } };
    setChanged(true);
  };

  const cancel = () => {
    if (changed && !window.confirm("Throw away your changes?")) return;
    setEditing(false);
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      if (!draft.current) return;
      const r = await saveHomeContent({
        expectedVersion: draft.current.version,
        content: draft.current.content,
      });
      if (!r.ok) {
        const detail = r.fieldErrors ? Object.values(r.fieldErrors)[0] : null;
        return setMessage({ ok: false, text: detail ?? r.message });
      }
      setEditing(false);
      setChanged(false);
      setMessage({ ok: true, text: "Saved. Everyone now sees the new wording." });
      router.refresh();
    });

  return (
    <EditContext value={{ editing, session, change }}>
      {children}
      {allowed ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
          <div
            role="region"
            aria-label="Edit the home page"
            className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2 shadow-[0_12px_32px_-12px_rgba(17,17,17,0.45)]"
          >
            {editing ? (
              <>
                <p className="px-2 text-sm font-medium text-ink">
                  Click any text with a dotted outline and type.
                </p>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending || !changed}
                  className="inline-flex items-center gap-1.5 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-royal disabled:opacity-50"
                >
                  <Check aria-hidden className="size-4" />
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
                >
                  <X aria-hidden className="size-4" />
                  Cancel
                </button>
                <Link
                  href="/admin/home-page"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-navy no-underline hover:bg-paper"
                >
                  <SlidersHorizontal aria-hidden className="size-4" />
                  Show or hide sections
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={begin}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-royal disabled:opacity-50"
              >
                <Pencil aria-hidden className="size-4" />
                {pending ? "Opening…" : "Edit this page"}
              </button>
            )}
            {message ? (
              <p role="status" className={`px-2 text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>
                {message.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </EditContext>
  );
}

const editableClass =
  "cursor-text rounded-sm outline-2 outline-offset-4 outline-gold outline-dashed focus:outline-solid focus:outline-navy";

// Inside links and buttons, a click places the cursor instead of following the link.
const stayHere = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/** A piece of home page text; editable in place while editing. */
export function EditableText({
  section,
  field,
  text,
  label,
  multiline = false,
}: {
  section: Section;
  field: string;
  /** What the page shows now. */
  text: string;
  /** Read out to screen readers, e.g. "Introduction". */
  label: string;
  multiline?: boolean;
}) {
  const { editing, session, change } = useContext(EditContext);
  if (!editing) return <>{text}</>;
  return (
    <span
      key={session}
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      className={editableClass}
      onClick={stayHere}
      onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onInput={(e) => change(section, field, (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim())}
    >
      {text}
    </span>
  );
}

/** The About text: formatted text, edited in place (cleaned on the server when saved). */
export function EditableRichText({
  section,
  field,
  html,
  label,
  className,
}: {
  section: Section;
  field: string;
  html: string;
  label: string;
  className?: string;
}) {
  const { editing, session, change } = useContext(EditContext);
  if (!editing) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div
      key={session}
      role="textbox"
      aria-label={label}
      aria-multiline
      contentEditable
      suppressContentEditableWarning
      className={`${className ?? ""} ${editableClass}`}
      onInput={(e) => change(section, field, e.currentTarget.innerHTML)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

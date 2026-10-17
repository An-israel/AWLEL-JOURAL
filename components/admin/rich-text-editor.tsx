"use client";

import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30",
        active && "bg-[#E8EDFA] text-navy",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, allowHeadings }: { editor: Editor; allowHeadings: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      mark: e.isActive("highlight"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap gap-0.5 border-b border-line bg-paper/60 p-1"
    >
      <ToolButton label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolButton>
      {allowHeadings ? (
        <>
          <ToolButton label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" />
          </ToolButton>
          <ToolButton
            label="Subheading"
            active={s.h3}
            onClick={() => chain().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="size-4" />
          </ToolButton>
        </>
      ) : null}
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolButton>
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton label="Quotation" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolButton>
      <ToolButton
        label={s.link ? "Remove link" : "Add link"}
        active={s.link}
        onClick={() => {
          if (s.link) return chain().unsetLink().run();
          const url = window.prompt("Link address (https://…)");
          if (url && /^(https?:\/\/|mailto:|\/)/.test(url))
            chain().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Mark as placeholder to replace"
        active={s.mark}
        onClick={() => chain().toggleHighlight().run()}
      >
        <Highlighter className="size-4" />
      </ToolButton>
      <span className="mx-1 w-px bg-line" aria-hidden />
      <ToolButton label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className="size-4" />
      </ToolButton>
    </div>
  );
}

/**
 * Tiptap editor producing HTML. The server sanitises whatever it receives,
 * so this is a convenience, not a security boundary.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  allowHeadings = true,
  minHeight = "12rem",
  labelledBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (html: string) => void;
  allowHeadings?: boolean;
  minHeight?: string;
  labelledBy?: string;
  invalid?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: allowHeadings ? { levels: [2, 3] } : false,
        link: false,
        codeBlock: false,
        code: false,
      }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["mailto"] }),
      Highlight.configure({ multicolor: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        class: "prose-reading max-w-none px-4 py-3 outline-none",
        style: `min-height:${minHeight}`,
        "aria-multiline": "true",
        role: "textbox",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-white focus-within:border-royal",
        invalid ? "border-coral-ink" : "border-line",
      )}
    >
      {editor ? (
        <Toolbar editor={editor} allowHeadings={allowHeadings} />
      ) : (
        <div className="h-10 border-b border-line bg-paper/60" />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

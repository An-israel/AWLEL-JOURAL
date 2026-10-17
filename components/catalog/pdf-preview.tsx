"use client";

import { useState } from "react";

/** Collapsible inline PDF preview; the PDF loads only when opened. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="group rounded-lg border border-line bg-white"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-navy [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        Preview the PDF
      </summary>
      {opened ? (
        <iframe
          src={src}
          title={`PDF of ${title}`}
          className="h-[80vh] w-full border-t border-line"
          loading="lazy"
        />
      ) : null}
    </details>
  );
}

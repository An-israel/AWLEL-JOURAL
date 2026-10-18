"use client";

import { ExternalLink } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

// Phones and tablets can't show a PDF inside a page (Android shows a blank
// frame, iOS only the first page), so they get just the link to open it.
const CAN_EMBED = "(pointer: fine) and (min-width: 768px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(CAN_EMBED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A link that opens the PDF in a new tab, plus, on desktop, a collapsible
 * inline preview that loads the PDF only when opened. Opening the PDF this
 * way is reading, not downloading, so it isn't counted as a download.
 */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [opened, setOpened] = useState(false);
  const canEmbed = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(CAN_EMBED).matches,
    () => false,
  );

  const link = (
    <a
      href={src}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:text-royal"
    >
      <ExternalLink aria-hidden className="size-4" />
      Open the PDF in a new tab
    </a>
  );

  if (!canEmbed) {
    return <div className="rounded-lg border border-line bg-white px-5 py-4">{link}</div>;
  }

  return (
    <div className="rounded-lg border border-line bg-white">
      <details
        className="group"
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
      <div className="border-t border-line px-5 py-3">{link}</div>
    </div>
  );
}

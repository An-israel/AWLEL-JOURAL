"use client";

import { MessageCircle, Check, Link2, Mail } from "lucide-react";
import { useState } from "react";

export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  // Brand glyphs are drawn as images, not text, so each link's spoken name is
  // just its label (WCAG 2.5.3, label in name).
  const links = [
    { label: "Email", href: `mailto:?subject=${t}&body=${u}`, icon: <Mail aria-hidden className="size-4" /> },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <rect x="3" y="9" width="4" height="12" rx="0.5" />
          <circle cx="5" cy="4.5" r="2.2" />
          <path d="M10 9h3.8v1.8c.7-1.2 2-2.1 3.9-2.1 3 0 4.3 1.9 4.3 5.2V21h-4v-6.4c0-1.6-.6-2.5-1.9-2.5-1.4 0-2.1 1-2.1 2.6V21h-4z" />
        </svg>
      ),
    },
    {
      label: "X",
      href: `https://x.com/intent/post?url=${u}&text=${t}`,
      icon: (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <path d="M4 4l16 16M20 4L4 20" />
        </svg>
      ),
    },
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${t}%20${u}`,
      icon: <MessageCircle aria-hidden className="size-4" />,
    },
  ];

  return (
    <section aria-labelledby="share-title" className="rounded-lg border border-line bg-white p-5">
      <h2 id="share-title" className="text-base font-semibold">
        Share
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        <li>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-navy hover:border-navy"
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </li>
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target={link.href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              aria-label={`Share by ${link.label}${link.href.startsWith("mailto:") ? "" : " (opens in a new tab)"}`}
              className="inline-flex size-10 items-center justify-center rounded-md border border-line text-navy no-underline hover:border-navy hover:bg-navy hover:text-white"
            >
              {link.icon}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

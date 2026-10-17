"use client";

import { Check, Link2, Mail } from "lucide-react";
import { useState } from "react";

export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const links = [
    { label: "Email", href: `mailto:?subject=${t}&body=${u}`, icon: <Mail aria-hidden className="size-4" /> },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      icon: (
        <span aria-hidden className="text-[0.8rem] font-bold">
          in
        </span>
      ),
    },
    {
      label: "X",
      href: `https://x.com/intent/post?url=${u}&text=${t}`,
      icon: (
        <span aria-hidden className="text-[0.8rem] font-bold">
          𝕏
        </span>
      ),
    },
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${t}%20${u}`,
      icon: (
        <span aria-hidden className="text-[0.8rem] font-bold">
          WA
        </span>
      ),
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

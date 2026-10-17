import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeading({
  id,
  eyebrow,
  title,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">{eyebrow}</p>
        ) : null}
        <h2 id={id} className="mt-1.5 text-2xl sm:text-[1.75rem]">
          {title}
        </h2>
        <hr className="rule-gold mt-4 w-16" />
      </div>
      {action ? (
        <Link href={action.href} className="text-sm font-semibold text-navy hover:text-royal">
          {action.label} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

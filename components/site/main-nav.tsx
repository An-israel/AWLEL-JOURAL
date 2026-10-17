"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV } from "@/lib/site";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop navigation bar (≥1280px). Below that, the slide-out menu is used. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden bg-navy xl:block">
      <ul className="mx-auto flex max-w-site items-stretch justify-between px-8">
        {MAIN_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative block px-3 py-3.5 text-[0.9rem] font-medium tracking-wide text-white/85 no-underline transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t after:transition-colors hover:text-white focus-visible:outline-white ${
                  active ? "text-white after:bg-gold-light" : "after:bg-transparent hover:after:bg-white/30"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

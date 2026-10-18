"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MAIN_NAV } from "@/lib/site";
import { accountLink, useSignedIn } from "./account-link";
import { isActive } from "./main-nav";

/**
 * Slide-out menu below 1280px. Uses a modal <dialog>, which gives focus
 * trapping, Escape to close and an inert background for free.
 */
export function MobileNav() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // Phones have no header account link (it is hidden below 640px), so the
  // menu carries it, with the same label (item 31).
  const { signedIn, recheck } = useSignedIn();
  const account = accountLink(signedIn);

  // Close after navigating.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          recheck();
          dialog.current?.showModal();
        }}
        className="inline-flex size-11 items-center justify-center rounded-md text-navy hover:bg-paper xl:hidden"
        aria-label="Open menu"
        aria-haspopup="dialog"
      >
        <Menu aria-hidden className="size-6" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={(e) => {
          // A tap on the backdrop, or on any link, including the one for the
          // page already open, which would not change the path (item 32).
          if (e.target === dialog.current || (e.target as Element).closest("a")) dialog.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none bg-white p-0 shadow-2xl backdrop:bg-ink/50 open:animate-[slide-in_200ms_ease-out]"
      >
        <div className="flex h-full flex-col">
          <div className="accent-bands h-1.5" aria-hidden />
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="text-sm font-medium tracking-widest text-ink-muted uppercase">Menu</span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-paper"
              aria-label="Close menu"
            >
              <X aria-hidden className="size-6" />
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto py-2">
            <ul>
              {MAIN_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block border-l-[3px] px-5 py-3 text-base no-underline ${
                        active
                          ? "border-coral bg-paper font-semibold text-navy"
                          : "border-transparent font-medium text-ink hover:bg-paper hover:text-navy"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="space-y-3 border-t border-line p-5">
            <Link
              href="/submit"
              className="block rounded-md bg-navy px-4 py-3 text-center font-medium text-white no-underline hover:bg-royal"
            >
              Submit a Manuscript
            </Link>
            <Link
              href={account.href}
              onFocus={recheck}
              className="block rounded-md border border-line px-4 py-3 text-center font-medium text-navy no-underline hover:border-navy"
            >
              {account.label}
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

"use client";

import {
  Activity,
  CircleUserRound,
  ClipboardCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Mail,
  Menu,
  House,
  PanelsTopLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { signOut } from "@/app/(public)/(auth)/actions";
import { LogoMark } from "@/components/site/logo";
import type { AdminNavItem } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  library: Library,
  "file-text": FileText,
  tags: Tags,
  inbox: Inbox,
  "clipboard-check": ClipboardCheck,
  house: House,
  "panels-top-left": PanelsTopLeft,
  "users-round": UsersRound,
  mail: Mail,
  "shield-check": ShieldCheck,
  settings: Settings,
  "scroll-text": ScrollText,
  "circle-user-round": CircleUserRound,
  activity: Activity,
};

interface Props {
  items: AdminNavItem[];
  userName: string;
  roleLabel: string;
}

function NavList({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? FileText;
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        if (item.comingIn) {
          return (
            <li key={item.href}>
              <span
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/45"
                aria-disabled="true"
              >
                <Icon aria-hidden className="size-4" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] tracking-wide uppercase">
                  Soon
                </span>
              </span>
            </li>
          );
        }
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors focus-visible:outline-white",
                active
                  ? "bg-white/12 text-white shadow-[inset_3px_0_0_var(--gold-light)]"
                  : "text-white/80 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({ items, userName, roleLabel }: Props) {
  return (
    <div className="flex h-full flex-col bg-navy-deep text-white">
      <div className="accent-bands h-1" aria-hidden />
      <Link href="/admin" className="flex items-center gap-3 px-5 py-5 text-white no-underline">
        <LogoMark className="size-9" />
        <span>
          <span className="block text-lg leading-none font-bold">AWLEL</span>
          <span className="text-xs text-white/70">Editorial dashboard</span>
        </span>
      </Link>
      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList items={items} />
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold">{userName}</p>
        <p className="text-xs text-gold-light">{roleLabel}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Link href="/" className="text-xs text-white/75 hover:text-white">
            View public site
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-white/75 hover:bg-white/10 hover:text-white"
            >
              <LogOut aria-hidden className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar(props: Props) {
  const drawer = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => drawer.current?.close(), [pathname]);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <SidebarBody {...props} />
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-2 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-navy no-underline">
          <LogoMark className="size-7" /> AWLEL Admin
        </Link>
        <button
          type="button"
          onClick={() => drawer.current?.showModal()}
          className="inline-flex size-11 items-center justify-center rounded-md text-navy hover:bg-paper"
          aria-label="Open admin menu"
        >
          <Menu aria-hidden className="size-6" />
        </button>
      </div>
      <dialog
        ref={drawer}
        aria-label="Admin menu"
        onClick={(e) => e.target === drawer.current && drawer.current.close()}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] p-0 backdrop:bg-ink/50"
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={() => drawer.current?.close()}
            className="absolute top-4 right-3 z-10 rounded p-1.5 text-white/80 hover:bg-white/10"
            aria-label="Close admin menu"
          >
            <X aria-hidden className="size-5" />
          </button>
          <SidebarBody {...props} />
        </div>
      </dialog>
    </>
  );
}

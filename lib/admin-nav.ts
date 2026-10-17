import type { UserRole } from "./roles";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
  roles: readonly UserRole[];
  /** Set while the section is still being built; shown as "Soon". */
  comingIn?: string;
}

const STAFF: readonly UserRole[] = ["super_admin", "editor"];
const SUPER: readonly UserRole[] = ["super_admin"];
const ALL: readonly UserRole[] = ["super_admin", "editor", "reviewer"];

// Sections from section 10 of the brief, in order.
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "layout-dashboard", roles: STAFF },
  { href: "/admin/issues", label: "Volumes and Issues", icon: "library", roles: STAFF },
  { href: "/admin/articles", label: "Articles", icon: "file-text", roles: STAFF },
  { href: "/admin/categories", label: "Categories", icon: "tags", roles: STAFF },
  { href: "/admin/submissions", label: "Submissions", icon: "inbox", roles: STAFF, comingIn: "M6" },
  { href: "/admin/reviews", label: "Reviews", icon: "clipboard-check", roles: ALL, comingIn: "M6" },
  { href: "/admin/pages", label: "Pages", icon: "panels-top-left", roles: SUPER },
  {
    href: "/admin/editorial-board",
    label: "Editorial Board",
    icon: "users-round",
    roles: SUPER,
  },
  { href: "/admin/messages", label: "Messages", icon: "mail", roles: STAFF },
  { href: "/admin/users", label: "Users and Roles", icon: "shield-check", roles: SUPER },
  { href: "/admin/settings", label: "Settings", icon: "settings", roles: SUPER },
  { href: "/admin/audit-log", label: "Audit Log", icon: "scroll-text", roles: SUPER, comingIn: "M8" },
  { href: "/admin/profile", label: "My profile", icon: "circle-user-round", roles: ALL },
];

export function navFor(role: UserRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => item.roles.includes(role));
}

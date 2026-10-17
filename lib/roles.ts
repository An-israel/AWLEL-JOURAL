// Role vocabulary shared by server and client code. Permissions themselves
// are enforced by RLS in the database (section 6); these helpers only decide
// what to show and where to send people.

export const ROLES = ["super_admin", "editor", "reviewer", "author"] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  editor: "Editor",
  reviewer: "Reviewer",
  author: "Author",
};

export const STAFF_ROLES: readonly UserRole[] = ["super_admin", "editor"];
export const ADMIN_AREA_ROLES: readonly UserRole[] = ["super_admin", "editor", "reviewer"];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** Where someone lands after signing in. */
export function landingPathFor(role: UserRole): string {
  if (role === "reviewer") return "/admin/reviews";
  return ADMIN_AREA_ROLES.includes(role) ? "/admin" : "/account";
}

/**
 * Only same-site relative paths are accepted as post-login destinations, so
 * `?next=` can't be used to bounce people to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  // Browsers drop tabs and newlines inside URLs ("/\t/evil.com" becomes
  // "//evil.com"), so no control characters, spaces or backslashes at all.
  if (/[\u0000-\u0020\u007f\\]/.test(next)) return null;
  // Then resolve it the way the browser will and insist it stays on this site.
  const base = "https://same-site.invalid";
  let resolved: URL;
  try {
    resolved = new URL(next, base);
  } catch {
    return null;
  }
  if (resolved.origin !== base) return null;
  return resolved.pathname + resolved.search + resolved.hash;
}

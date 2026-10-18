import type { UserRole } from "@/lib/roles";

/** One line per role, for the invite form and the Users page (item 84). */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  author: "Submits manuscripts and follows their progress. No access to the admin area.",
  reviewer: "Reviews the manuscripts assigned to them, without seeing who wrote them.",
  editor: "Runs the journal: issues, articles, categories, submissions, reviews and messages.",
  super_admin:
    "Everything an Editor can do, plus users and roles, settings, pages, the editorial board and the audit log.",
};

/** What a Super Admin loses by changing their own role. */
export const SELF_DEMOTION_WARNING =
  "You will lose access to Users and Roles, Settings and Pages immediately, as well as the Editorial Board, Audit Log and Operations. Only another Super Admin can give it back.";

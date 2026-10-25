// Plain-English names for what the audit log records (migrations 1, 10 and
// 17), shared by the Audit Log page and the dashboard's recent activity.

export const ACTIONS: Record<string, string> = {
  publish: "Published",
  unpublish: "Unpublished",
  status_change: "Status changed",
  update: "Edited",
  soft_delete: "Moved to trash",
  restore: "Restored",
  delete: "Deleted",
  role_change: "Role or access changed",
  file_replace: "File replaced",
  dead_letter_retried: "Failed job retried",
  dead_letter_discarded: "Failed job discarded",
};

export const ENTITIES: Record<string, { label: string; href?: (id: string) => string }> = {
  issues: { label: "Issue", href: (id) => `/admin/issues/${id}` },
  articles: { label: "Article", href: (id) => `/admin/articles/${id}` },
  volumes: { label: "Volume", href: () => "/admin/issues" },
  categories: { label: "Category", href: () => "/admin/categories" },
  submissions: { label: "Submission", href: (id) => `/admin/submissions/${id}` },
  profiles: { label: "User", href: () => "/admin/users" },
  // Pages are edited by slug; the Audit Log swaps the id for it.
  pages: { label: "Page", href: (slug) => `/admin/pages/${slug}` },
  editorial_board_members: { label: "Board member", href: (id) => `/admin/editorial-board/${id}` },
  site_settings: { label: "Settings", href: () => "/admin/settings" },
  feature_flags: { label: "Feature switch", href: () => "/admin/settings" },
  dead_letter_jobs: { label: "Failed job", href: () => "/admin/operations" },
};

export const ACTION_BADGE: Record<string, "default" | "gold" | "coral" | "green" | "muted"> = {
  publish: "green",
  unpublish: "gold",
  update: "default",
  delete: "coral",
  soft_delete: "coral",
  role_change: "gold",
  file_replace: "default",
};

/** "Edited · Page", for one-line summaries such as the dashboard. */
export function describeAction(action: string, entityType: string): string {
  return `${ACTIONS[action] ?? action.replace(/_/g, " ")} · ${ENTITIES[entityType]?.label ?? entityType.replace(/_/g, " ")}`;
}

const FIELDS: Record<string, string> = {
  title: "Title",
  content: "Page text",
  meta_description: "Search engine description",
  needs_review: "Contains placeholder text",
  name: "Name",
  slug: "Web address",
  description: "Description",
  is_archived: "Archived",
  affiliation: "Affiliation",
  group_id: "Board group",
  needs_verification: "Needs checking",
  journal_name: "Journal name",
  home_content: "Home page wording",
  journal_short_name: "Short name",
  subtitle: "Subtitle",
  issn: "ISSN",
  publisher: "Publisher",
  contact_email: "Contact email",
  postal_address: "Postal address",
  publication_frequency: "Publication frequency",
  social_links: "Social links",
  licence: "Licence",
  enabled: "Switched on",
  status: "Status",
  role: "Role",
  is_active: "Active",
  job_type: "Job",
  cover_file_id: "Cover image",
  full_pdf_file_id: "Full-issue PDF",
  full_docx_file_id: "Full-issue Word file",
  pdf_file_id: "PDF",
  docx_file_id: "Word file",
  photo_file_id: "Photo",
  logo_file_id: "Logo",
  default_og_image_file_id: "Sharing image",
};

export function fieldLabel(key: string): string {
  return FIELDS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const MAX = 80;

/** A stored value as an editor would say it: never raw JSON, never a whole page. */
function show(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "role" && typeof value === "string")
    return (
      { super_admin: "Super Admin", editor: "Editor", reviewer: "Reviewer", author: "Author" }[value] ?? value
    );
  if (key?.endsWith("_file_id")) return "a file";
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${fieldLabel(k)}: ${show(v, k)}`);
    return parts.length ? parts.join(", ") : "(empty)";
  }
  const text = String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text;
}

export interface DetailLine {
  field: string;
  from?: string;
  to?: string;
}

/**
 * The audit diff as readable lines, "Field: old → new" (item 83). Long text
 * (page bodies) is named but not shown.
 */
export function describeDiff(action: string, diff: Record<string, unknown> | null): DetailLine[] {
  if (!diff) return [];
  if (action === "update") {
    const fields = Array.isArray(diff.fields) ? (diff.fields as string[]) : [];
    const changes = (diff.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
    return fields.map((k) =>
      changes[k]
        ? { field: fieldLabel(k), from: show(changes[k].from, k), to: show(changes[k].to, k) }
        : { field: fieldLabel(k), to: "changed (too long to show)" },
    );
  }
  if (action === "file_replace" && typeof diff.field === "string") {
    return [{ field: fieldLabel(diff.field), to: "replaced with a new file" }];
  }
  if (action === "role_change") {
    const from = (diff.from ?? {}) as Record<string, unknown>;
    const to = (diff.to ?? {}) as Record<string, unknown>;
    return ["role", "is_active"]
      .filter((k) => JSON.stringify(from[k]) !== JSON.stringify(to[k]))
      .map((k) => ({ field: fieldLabel(k), from: show(from[k], k), to: show(to[k], k) }));
  }
  if ("from" in diff || "to" in diff) {
    return [{ field: "Status", from: show(diff.from), to: show(diff.to) }];
  }
  if (action === "delete" && diff.old && typeof diff.old === "object") {
    const old = diff.old as Record<string, unknown>;
    return ["title", "name", "full_name", "slug", "volume_number", "issue_number", "status"]
      .filter((k) => old[k] !== undefined && old[k] !== null)
      .map((k) => ({ field: k === "full_name" ? "Name" : fieldLabel(k), to: show(old[k], k) }));
  }
  return Object.entries(diff).map(([k, v]) => ({ field: fieldLabel(k), to: show(v, k) }));
}

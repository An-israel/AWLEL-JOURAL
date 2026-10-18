import "server-only";
import { pageRange } from "@/components/catalog/page-range";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAdminIssues, type AdminIssue } from "./issue-data";

export interface Option {
  id: string;
  label: string;
}

/** An issue's name with its state, so a trashed or draft issue is never mistaken for a live one (item 79). */
export function issueOptionLabel(issue: Pick<AdminIssue, "label" | "status" | "deleted">): string {
  if (issue.deleted) return `${issue.label} (in trash)`;
  return issue.status === "draft" ? `${issue.label} (draft issue)` : issue.label;
}

/**
 * Issue and category choices for the article form (drafts included, trash
 * excluded). The article's own issue and category are always listed, even
 * when trashed or archived, so the form never silently shows another one.
 */
export async function loadArticleOptions(
  currentCategoryId?: string | null,
  currentIssueId?: string | null,
): Promise<{ issues: Option[]; categories: Option[] }> {
  const supabase = await createSupabaseServerClient();
  const [issues, { data: cats }] = await Promise.all([
    loadAdminIssues(),
    supabase.from("categories").select("id, name, is_archived").order("sort_order"),
  ]);
  return {
    issues: issues
      .filter((i) => !i.deleted || i.id === currentIssueId)
      .map((i) => ({ id: i.id, label: issueOptionLabel(i) })),
    categories: (cats ?? [])
      .filter((c) => !c.is_archived || c.id === currentCategoryId)
      .map((c) => ({ id: c.id, label: c.is_archived ? `${c.name} (archived)` : c.name })),
  };
}

export { pageRange };

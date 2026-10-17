import "server-only";
import { pageRange } from "@/components/catalog/page-range";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAdminIssues } from "./issue-data";

export interface Option {
  id: string;
  label: string;
}

/** Issue and category choices for the article form (drafts included, trash excluded). */
export async function loadArticleOptions(currentCategoryId?: string | null): Promise<{ issues: Option[]; categories: Option[] }> {
  const supabase = await createSupabaseServerClient();
  const [issues, { data: cats }] = await Promise.all([
    loadAdminIssues(),
    supabase.from("categories").select("id, name, is_archived").order("sort_order"),
  ]);
  return {
    issues: issues
      .filter((i) => !i.deleted)
      .map((i) => ({ id: i.id, label: `${i.label}${i.status === "draft" ? " · draft" : ""}` })),
    categories: (cats ?? [])
      .filter((c) => !c.is_archived || c.id === currentCategoryId)
      .map((c) => ({ id: c.id, label: c.is_archived ? `${c.name} (archived)` : c.name })),
  };
}

export { pageRange };

import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categories" };

async function Content() {
  await requireRole(STAFF_ROLES, "/admin/categories");
  const supabase = await createSupabaseServerClient();
  const [cats, arts] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, description, is_archived, version, sort_order")
      .order("sort_order"),
    supabase.from("articles").select("category_id").is("deleted_at", null),
  ]);
  if (cats.error || arts.error) throw new Error("Could not load categories");
  const counts = new Map<string, number>();
  for (const a of arts.data)
    if (a.category_id) counts.set(a.category_id, (counts.get(a.category_id) ?? 0) + 1);
  return (
    <CategoriesManager
      initial={cats.data.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        isArchived: c.is_archived,
        version: c.version,
        articleCount: counts.get(c.id) ?? 0,
      }))}
    />
  );
}

export default function CategoriesPage() {
  return (
    <>
      <AdminPageHeader
        title="Categories"
        crumbs={[{ label: "Categories" }]}
        description="Subject areas. Each has a public page listing its articles. Counts include drafts."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

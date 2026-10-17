import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoardManager } from "./board-manager";

export const metadata: Metadata = { title: "Editorial Board" };

async function Content() {
  await requireRole(["super_admin"], "/admin/editorial-board");
  const supabase = await createSupabaseServerClient();
  const [{ data: groups }, { data: members }] = await Promise.all([
    supabase.from("editorial_board_groups").select("id, version, name").order("sort_order"),
    supabase
      .from("editorial_board_members")
      .select("id, version, group_id, name, title, affiliation, needs_verification, deleted_at")
      .order("sort_order"),
  ]);
  return (
    <BoardManager
      initial={(groups ?? []).map((g) => ({
        id: g.id,
        version: g.version,
        name: g.name,
        members: (members ?? [])
          .filter((m) => m.group_id === g.id)
          .map((m) => ({
            id: m.id,
            version: m.version,
            name: m.name,
            title: m.title,
            affiliation: m.affiliation,
            needsVerification: m.needs_verification,
            deleted: Boolean(m.deleted_at),
          })),
      }))}
    />
  );
}

export default function BoardPage() {
  return (
    <>
      <AdminPageHeader
        title="Editorial Board"
        crumbs={[{ label: "Editorial Board" }]}
        description="Who appears on the public Editorial Board page, grouped by role."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FILE_COLUMNS, toAttached } from "@/lib/admin/files-data";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MemberEditor } from "./member-editor";

export const metadata: Metadata = { title: "Board member" };

type Props = PageProps<"/admin/editorial-board/[id]">;

async function Content({ params, searchParams }: Props) {
  const { id } = await params;
  await requireRole(["super_admin"], `/admin/editorial-board/${id}`);
  const supabase = await createSupabaseServerClient();
  const { data: groups } = await supabase
    .from("editorial_board_groups")
    .select("id, name")
    .order("sort_order");
  if (!groups?.length) notFound();

  if (id === "new") {
    const { group } = await searchParams;
    const groupId = typeof group === "string" && groups.some((g) => g.id === group) ? group : groups[0].id;
    return (
      <>
        <AdminPageHeader
          title="Add board member"
          crumbs={[{ href: "/admin/editorial-board", label: "Editorial Board" }, { label: "Add" }]}
        />
        <MemberEditor
          groups={groups}
          member={{ groupId, name: "", title: "", affiliation: "", needsVerification: false, photo: null }}
        />
      </>
    );
  }

  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: m } = await supabase
    .from("editorial_board_members")
    .select(
      `id, version, group_id, name, title, affiliation, needs_verification, photo:stored_files!editorial_board_members_photo_file_id_fkey(${FILE_COLUMNS})`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!m) notFound();
  return (
    <>
      <AdminPageHeader
        title={m.name}
        crumbs={[{ href: "/admin/editorial-board", label: "Editorial Board" }, { label: m.name }]}
      />
      <MemberEditor
        groups={groups}
        member={{
          id: m.id,
          version: m.version,
          groupId: m.group_id,
          name: m.name,
          title: m.title ?? "",
          affiliation: m.affiliation ?? "",
          needsVerification: m.needs_verification,
          photo: toAttached(m.photo),
        }}
      />
    </>
  );
}

export default function MemberPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-line" />}>
      <Content {...props} />
    </Suspense>
  );
}

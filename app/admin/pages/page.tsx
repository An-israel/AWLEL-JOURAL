import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pages" };
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

async function Content() {
  await requireRole(["super_admin"], "/admin/pages");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("pages")
    .select("slug, title, needs_review, updated_at, editor:profiles(full_name)")
    .order("title");
  return (
    <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
      {(data ?? []).map((p) => (
        <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href={`/admin/pages/${p.slug}`} className="font-medium">
              {p.title}
            </Link>
            <p className="text-xs text-ink-muted">
              /{p.slug} · updated {date.format(new Date(p.updated_at))}
              {p.editor?.full_name ? ` by ${p.editor.full_name}` : ""}
            </p>
          </div>
          {p.needs_review ? (
            <Badge variant="gold">Has placeholders</Badge>
          ) : (
            <Badge variant="green">Ready</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PagesPage() {
  return (
    <>
      <AdminPageHeader
        title="Pages"
        crumbs={[{ label: "Pages" }]}
        description="The journal's static pages. Changes go live as soon as you save."
      />
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

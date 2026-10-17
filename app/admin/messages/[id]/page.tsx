import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MessageActions } from "../message-actions";

export const metadata: Metadata = { title: "Message" };
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

type Props = PageProps<"/admin/messages/[id]">;

async function Content({ params }: { params: Props["params"] }) {
  const { id } = await params;
  await requireRole(STAFF_ROLES, `/admin/messages/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: m } = await supabase.from("contact_messages").select("*").eq("id", id).maybeSingle();
  if (!m) notFound();
  const reply = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`;
  return (
    <>
      <AdminPageHeader
        title={m.subject}
        crumbs={[{ href: "/admin/messages", label: "Messages" }, { label: "Message" }]}
        actions={<MessageActions id={m.id} isRead={m.is_read} deleted={Boolean(m.deleted_at)} />}
      />
      <article className="mt-6 max-w-3xl rounded-lg border border-line bg-white p-6">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[6rem_1fr]">
          <dt className="text-ink-muted">From</dt>
          <dd>
            {m.name} &lt;{m.email}&gt;
          </dd>
          <dt className="text-ink-muted">Received</dt>
          <dd>{date.format(new Date(m.created_at))}</dd>
        </dl>
        {/* Rendered as text, never as HTML: this came from a public form. */}
        <div className="mt-6 border-t border-line pt-6 font-serif text-[1.05rem] leading-relaxed whitespace-pre-wrap">
          {m.message}
        </div>
        <div className="mt-6">
          <Button asChild>
            <a href={reply}>Reply by email</a>
          </Button>
        </div>
      </article>
    </>
  );
}

export default function MessagePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-line" />}>
      <Content params={params} />
    </Suspense>
  );
}

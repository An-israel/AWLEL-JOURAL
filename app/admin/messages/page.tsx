import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };
const PAGE_SIZE = 30;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  show: z.enum(["unread", "all", "trash"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

type Props = PageProps<"/admin/messages">;

async function Content({ searchParams }: { searchParams: Props["searchParams"] }) {
  await requireRole(STAFF_ROLES, "/admin/messages");
  const f = filtersSchema.parse(await searchParams);
  const page = f.page ?? 1;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("contact_messages")
    .select("id, name, email, subject, message, is_read, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = f.show === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (f.show === "unread") query = query.eq("is_read", false);
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(`subject.ilike.%${term}%,name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load messages");
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    if (f.show) qs.set("show", f.show);
    if (p > 1) qs.set("page", String(p));
    return `/admin/messages${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <form role="search" action="/admin/messages" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="m-q" className="text-xs font-medium text-ink-muted">
            Search name, email or subject
          </label>
          <Input id="m-q" name="q" defaultValue={f.q} className="mt-1" />
        </div>
        <div>
          <label htmlFor="m-show" className="text-xs font-medium text-ink-muted">
            Show
          </label>
          <NativeSelect id="m-show" name="show" defaultValue={f.show ?? "all"} className="mt-1 w-36">
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="trash">Trash</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <div className="mt-6">
        {data.length === 0 ? (
          <EmptyState title={f.show === "unread" ? "No unread messages" : "No messages"}>
            Messages sent through the Contact Us form appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {data.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/messages/${m.id}`}
                  className={cn(
                    "grid gap-1 px-4 py-3 no-underline hover:bg-paper/60 sm:grid-cols-[14rem_1fr_auto] sm:gap-4",
                    !m.is_read && "bg-[#E8EDFA]/40",
                  )}
                >
                  <span className={cn("truncate text-ink", !m.is_read && "font-semibold")}>
                    {!m.is_read ? (
                      <span className="mr-2 inline-block size-2 rounded-full bg-royal" aria-label="Unread" />
                    ) : null}
                    {m.name}
                  </span>
                  <span className="min-w-0 truncate text-ink-muted">
                    <span className={cn("text-ink", !m.is_read && "font-semibold")}>{m.subject}</span> —{" "}
                    {m.message.slice(0, 120)}
                  </span>
                  <span className="text-xs text-ink-muted">{date.format(new Date(m.created_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}

export default function MessagesPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Messages"
        crumbs={[{ label: "Messages" }]}
        description="Messages from the Contact Us form. Each one is also emailed to the editorial address."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

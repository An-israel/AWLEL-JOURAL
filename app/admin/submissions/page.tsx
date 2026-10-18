import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { isUnfinished, StatusBadge } from "@/components/submissions/status-badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { STATUS_LABELS, SUBMISSION_STATUSES } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submissions" };
const PAGE_SIZE = 25;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  status: z
    .enum([...SUBMISSION_STATUSES, "open", "unfinished"])
    .optional()
    .catch(undefined),
  category: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

type Props = PageProps<"/admin/submissions">;

async function Content({ searchParams }: { searchParams: Props["searchParams"] }) {
  await requireRole(STAFF_ROLES, "/admin/submissions");
  const f = filtersSchema.parse(await searchParams);
  const status = f.status ?? "open";
  const page = f.page ?? 1;
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase.from("categories").select("id, name").order("sort_order");

  let query = supabase
    .from("submissions")
    .select(
      "id, title, status, created_at, finalised_at, category:categories(name), author:profiles!submissions_author_id_fkey(full_name), reviews:review_assignments(status)",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  // Unfinished submissions (no Word manuscript yet, item 51) stay out of the
  // queue and the counts unless asked for.
  query =
    status === "unfinished"
      ? query.is("finalised_at", null).eq("status", "submitted")
      : status === "open"
        ? query.not("status", "in", "(rejected,published,withdrawn)").not("finalised_at", "is", null)
        : query.eq("status", status).not("finalised_at", "is", null);
  if (f.category) query = query.eq("category_id", f.category);
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.ilike("title", `%${term}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load submissions");
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    if (f.status) qs.set("status", f.status);
    if (f.category) qs.set("category", f.category);
    if (p > 1) qs.set("page", String(p));
    return `/admin/submissions${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <form
        role="search"
        action="/admin/submissions"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end"
      >
        <div>
          <label htmlFor="sf-q" className="text-xs font-medium text-ink-muted">
            Search titles
          </label>
          <Input id="sf-q" name="q" defaultValue={f.q} className="mt-1" />
        </div>
        <div>
          <label htmlFor="sf-status" className="text-xs font-medium text-ink-muted">
            Status
          </label>
          <NativeSelect id="sf-status" name="status" defaultValue={status} className="mt-1">
            <option value="open">All open</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            <option value="unfinished">Not finished by the author</option>
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="sf-cat" className="text-xs font-medium text-ink-muted">
            Category
          </label>
          <NativeSelect id="sf-cat" name="category" defaultValue={f.category ?? ""} className="mt-1">
            <option value="">All</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <p className="mt-6 mb-3 text-sm text-ink-muted">{count ?? 0} submissions</p>
      {data.length === 0 ? (
        <EmptyState title="No submissions here">
          New manuscripts submitted through the website appear in this list.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Manuscript</Th>
              <Th className="hidden lg:table-cell">Category</Th>
              <Th>Status</Th>
              <Th className="hidden md:table-cell">Reviews</Th>
              <Th className="hidden md:table-cell">Submitted</Th>
            </tr>
          </THead>
          <TBody>
            {data.map((s) => {
              const active = s.reviews.filter((r) => r.status !== "withdrawn");
              const done = active.filter((r) => r.status === "submitted").length;
              const unfinished = isUnfinished(s);
              return (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/admin/submissions/${s.id}`} className="font-medium">
                      {s.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {s.author?.full_name ?? "—"}
                      {unfinished ? <span className="ml-2 text-coral-ink">· no manuscript yet</span> : null}
                    </p>
                  </Td>
                  <Td className="hidden text-ink-muted lg:table-cell">{s.category?.name ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={s.status} unfinished={unfinished} />
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {active.length ? `${done} of ${active.length}` : "—"}
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {date.format(new Date(s.created_at))}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
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

export default function SubmissionsPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Submissions"
        crumbs={[{ label: "Submissions" }]}
        description="Manuscripts sent through the website. Open one to screen it, assign reviewers and record decisions."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

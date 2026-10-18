import type { Metadata } from "next";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { issueOptionLabel, loadArticleOptions } from "@/lib/admin/article-data";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Articles" };

const PAGE_SIZE = 25;
const filtersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  issue: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  status: z.enum(["draft", "published", "trash"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

type Props = PageProps<"/admin/articles">;
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

async function Content({ searchParams }: { searchParams: Props["searchParams"] }) {
  await requireRole(STAFF_ROLES, "/admin/articles");
  const f = filtersSchema.parse(await searchParams);
  const page = f.page ?? 1;
  const supabase = await createSupabaseServerClient();
  const [options, allIssues] = await Promise.all([loadArticleOptions(), loadAdminIssues()]);
  // Every issue, trashed and draft ones included, so no article shows "—" (item 79).
  const issueById = new Map(allIssues.map((i) => [i.id, i]));

  let query = supabase
    .from("articles")
    .select(
      "id, title, status, updated_at, issue_id, deleted_at, view_count, download_pdf_count, download_docx_count, category:categories(name)",
      {
        count: "exact",
      },
    )
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = f.status === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (f.status === "draft" || f.status === "published") query = query.eq("status", f.status);
  if (f.issue) query = query.eq("issue_id", f.issue);
  if (f.category) query = query.eq("category_id", f.category);
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.ilike("title", `%${term}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load articles");
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page: p > 1 ? p : undefined })) if (v) qs.set(k, String(v));
    return `/admin/articles${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <form
        role="search"
        action="/admin/articles"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto] lg:items-end"
      >
        <div>
          <label htmlFor="af-q" className="text-xs font-medium text-ink-muted">
            Search titles
          </label>
          <Input id="af-q" name="q" defaultValue={f.q} className="mt-1" />
        </div>
        <div>
          <label htmlFor="af-issue" className="text-xs font-medium text-ink-muted">
            Issue
          </label>
          <NativeSelect id="af-issue" name="issue" defaultValue={f.issue ?? ""} className="mt-1">
            <option value="">All issues</option>
            {options.issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="af-cat" className="text-xs font-medium text-ink-muted">
            Category
          </label>
          <NativeSelect id="af-cat" name="category" defaultValue={f.category ?? ""} className="mt-1">
            <option value="">All</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="af-status" className="text-xs font-medium text-ink-muted">
            Status
          </label>
          <NativeSelect id="af-status" name="status" defaultValue={f.status ?? ""} className="mt-1">
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="trash">Trash</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <p className="mt-6 mb-3 text-sm text-ink-muted">{total} articles</p>
      {data.length === 0 ? (
        <EmptyState title="No articles match">Try clearing the filters, or create a new article.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Title</Th>
              <Th className="hidden md:table-cell">Issue</Th>
              <Th className="hidden lg:table-cell">Category</Th>
              <Th>Status</Th>
              <Th className="hidden text-right xl:table-cell">Views</Th>
              <Th className="hidden text-right xl:table-cell" title="PDF + Word">
                Downloads
              </Th>
              <Th className="hidden md:table-cell">Updated</Th>
            </tr>
          </THead>
          <TBody>
            {data.map((a) => {
              const issue = issueById.get(a.issue_id);
              const live = issue?.status === "published" && !issue.deleted;
              return (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/admin/articles/${a.id}`} className="font-medium">
                      {a.title}
                    </Link>
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {issue ? issueOptionLabel(issue) : "—"}
                  </Td>
                  <Td className="hidden text-ink-muted lg:table-cell">{a.category?.name ?? "—"}</Td>
                  <Td>
                    {a.deleted_at ? (
                      <Badge variant="muted">Trash</Badge>
                    ) : a.status === "published" && !live ? (
                      <Badge variant="gold" title="Marked as published, but its issue isn't on the site">
                        Not live
                      </Badge>
                    ) : a.status === "published" ? (
                      <Badge variant="green">Published</Badge>
                    ) : (
                      <Badge variant="gold">Draft</Badge>
                    )}
                  </Td>
                  <Td className="hidden text-right tabular-nums xl:table-cell">
                    {a.view_count.toLocaleString("en")}
                  </Td>
                  <Td
                    className="hidden text-right tabular-nums xl:table-cell"
                    title={`${a.download_pdf_count} PDF · ${a.download_docx_count} Word`}
                  >
                    {(a.download_pdf_count + a.download_docx_count).toLocaleString("en")}
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {date.format(new Date(a.updated_at))}
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

export default function ArticlesPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Articles"
        crumbs={[{ label: "Articles" }]}
        actions={
          <Button asChild>
            <Link href="/admin/articles/new">
              <FilePlus2 aria-hidden /> New article
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

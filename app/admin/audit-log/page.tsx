import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { ACTION_BADGE, ACTIONS, describeDiff, ENTITIES } from "@/lib/admin/audit-labels";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const filtersSchema = z.object({
  action: z
    .enum(Object.keys(ACTIONS) as [string, ...string[]])
    .optional()
    .catch(undefined),
  entity: z
    .enum(Object.keys(ENTITIES) as [string, ...string[]])
    .optional()
    .catch(undefined),
  days: z.enum(["7", "30", "365"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

type Props = PageProps<"/admin/audit-log">;

/** Start of the "last N days" window (server components render once per request). */
function since(days: string): string {
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString();
}

async function Content({ searchParams }: { searchParams: Props["searchParams"] }) {
  await requireRole(["super_admin"], "/admin/audit-log");
  const f = filtersSchema.parse(await searchParams);
  const page = f.page ?? 1;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, diff, created_at, actor:profiles(full_name, email)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (f.action) query = query.eq("action", f.action);
  if (f.entity) query = query.eq("entity_type", f.entity);
  if (f.days) query = query.gte("created_at", since(f.days));
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load the audit log");

  // Names for the rows on this page: one query per kind, never one per row.
  const ids = (type: string) => [
    ...new Set(data.filter((r) => r.entity_type === type && r.entity_id).map((r) => r.entity_id!)),
  ];
  const [articles, issues, people, pageRows, categories] = await Promise.all([
    ids("articles").length
      ? supabase.from("articles").select("id, title").in("id", ids("articles"))
      : Promise.resolve({ data: [] }),
    ids("issues").length
      ? supabase
          .from("issues")
          .select("id, issue_number, volume:volumes(volume_number, year)")
          .in("id", ids("issues"))
      : Promise.resolve({ data: [] }),
    ids("profiles").length
      ? supabase.from("profiles").select("id, full_name").in("id", ids("profiles"))
      : Promise.resolve({ data: [] }),
    ids("pages").length
      ? supabase.from("pages").select("id, slug, title").in("id", ids("pages"))
      : Promise.resolve({ data: [] }),
    ids("categories").length
      ? supabase.from("categories").select("id, name").in("id", ids("categories"))
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  for (const a of articles.data ?? []) names.set(a.id, a.title);
  for (const i of issues.data ?? [])
    names.set(i.id, `Volume ${i.volume?.volume_number}, Issue ${i.issue_number} (${i.volume?.year})`);
  for (const p of people.data ?? []) names.set(p.id, p.full_name || "Unnamed user");
  for (const c of categories.data ?? []) names.set(c.id, c.name);
  // The page editor's address uses the slug, not the id.
  const pageSlugs = new Map<string, string>();
  for (const p of pageRows.data ?? []) {
    names.set(p.id, p.title);
    pageSlugs.set(p.id, p.slug);
  }

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page: p > 1 ? p : undefined })) if (v) qs.set(k, String(v));
    return `/admin/audit-log${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <form
        action="/admin/audit-log"
        className="mt-6 flex flex-wrap items-end gap-3"
        aria-label="Filter the audit log"
      >
        <div>
          <label htmlFor="al-action" className="text-xs font-medium text-ink-muted">
            Action
          </label>
          <NativeSelect id="al-action" name="action" defaultValue={f.action ?? ""} className="mt-1 w-52">
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="al-entity" className="text-xs font-medium text-ink-muted">
            What
          </label>
          <NativeSelect id="al-entity" name="entity" defaultValue={f.entity ?? ""} className="mt-1 w-44">
            <option value="">Everything</option>
            {Object.entries(ENTITIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="al-days" className="text-xs font-medium text-ink-muted">
            When
          </label>
          <NativeSelect id="al-days" name="days" defaultValue={f.days ?? ""} className="mt-1 w-40">
            <option value="">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="365">Last 12 months</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <p className="mt-6 mb-3 text-sm text-ink-muted">{(count ?? 0).toLocaleString("en")} entries</p>
      {data.length === 0 ? (
        <EmptyState title="Nothing recorded">
          Publishing, unpublishing, edits, deletions, role changes and file replacements are recorded here.
        </EmptyState>
      ) : (
        <ol
          aria-label="Audit log entries"
          className="divide-y divide-line rounded-lg border border-line bg-white"
        >
          {data.map((row) => {
            const entity = ENTITIES[row.entity_type];
            const diff = row.diff as Record<string, unknown>;
            // A deleted row no longer exists: show the name the log kept, and no link.
            const old =
              row.action === "delete" ? (diff?.old as Record<string, unknown> | undefined) : undefined;
            const kept = old
              ? String(
                  old.title ??
                    old.name ??
                    old.full_name ??
                    (old.volume_number ? `Volume ${old.volume_number}` : ""),
                )
              : "";
            const name = (row.entity_id && names.get(row.entity_id)) || kept || null;
            const target =
              row.entity_type === "pages" && row.entity_id ? pageSlugs.get(row.entity_id) : row.entity_id;
            const link = entity?.href && target && row.action !== "delete" ? entity.href(target) : null;
            const details = describeDiff(row.action, diff);
            return (
              <li key={row.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
                <time dateTime={row.created_at} className="text-ink-muted">
                  {when.format(new Date(row.created_at))}
                </time>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant={ACTION_BADGE[row.action] ?? "muted"}>
                      {ACTIONS[row.action] ?? row.action}
                    </Badge>
                    <span className="text-ink-muted">{entity?.label ?? row.entity_type}</span>
                    {link ? (
                      <Link href={link} className="font-medium">
                        {name ?? "Open"}
                      </Link>
                    ) : name ? (
                      <span className="font-medium">{name}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-ink-muted">
                    by{" "}
                    <span className="text-ink">
                      {row.actor?.full_name || row.actor?.email || "the system"}
                    </span>
                  </p>
                  {details.length ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-navy">Details</summary>
                      <ul className="mt-1 space-y-0.5 rounded bg-paper p-2 text-xs">
                        {details.map((d, i) => (
                          <li key={i} className="break-words">
                            <span className="font-medium text-ink">{d.field}:</span>{" "}
                            {d.from !== undefined ? (
                              <>
                                {d.from} <span aria-label="changed to">→</span> {d.to}
                              </>
                            ) : (
                              d.to
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)}>← Newer</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)}>Older →</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}

export default function AuditLogPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Audit Log"
        crumbs={[{ label: "Audit Log" }]}
        description="Who published, unpublished, edited, deleted, changed roles or replaced files, and when. Entries can't be edited or removed."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

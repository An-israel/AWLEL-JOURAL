import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { loadAdminIssues } from "@/lib/admin/issue-data";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddIssueButton, NewVolumeButton } from "./issues-toolbar";

export const metadata: Metadata = { title: "Volumes and Issues" };

async function Content() {
  await requireRole(STAFF_ROLES, "/admin/issues");
  const supabase = await createSupabaseServerClient();
  const [issues, volumes, articles] = await Promise.all([
    loadAdminIssues(),
    supabase.from("volumes").select("id, volume_number, year").order("year", { ascending: false }).order("volume_number", { ascending: false }),
    supabase.from("articles").select("issue_id, status").is("deleted_at", null),
  ]);
  if (volumes.error || articles.error) throw new Error("Could not load volumes");

  const counts = new Map<string, { total: number; drafts: number }>();
  for (const a of articles.data) {
    const c = counts.get(a.issue_id) ?? { total: 0, drafts: 0 };
    c.total += 1;
    if (a.status === "draft") c.drafts += 1;
    counts.set(a.issue_id, c);
  }
  const latest = volumes.data[0];
  const years = [...new Set(volumes.data.map((v) => v.year))];

  return (
    <>
      <div className="mt-6 flex justify-end">
        <NewVolumeButton
          suggestedNumber={(latest?.volume_number ?? 0) + 1}
          suggestedYear={(latest?.year ?? new Date().getFullYear() - 1) + 1}
        />
      </div>
      {volumes.data.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No volumes yet">Create a volume for a year, then add its issues.</EmptyState>
        </div>
      ) : null}
      <div className="mt-6 space-y-10">
        {years.map((year) => (
          <section key={year} aria-labelledby={`y-${year}`}>
            <h2 id={`y-${year}`} className="border-b border-line pb-2 text-2xl font-bold text-navy">
              {year}
            </h2>
            {volumes.data
              .filter((v) => v.year === year)
              .map((v) => {
                const list = issues.filter((i) => i.volumeId === v.id);
                return (
                  <div key={v.id} className="mt-4 rounded-lg border border-line bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <p className="font-semibold">Volume {v.volume_number}</p>
                      <AddIssueButton volumeId={v.id} volumeNumber={v.volume_number} nextIssue={Math.max(0, ...list.map((i) => i.issueNumber)) + 1} />
                    </div>
                    {list.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-ink-muted">No issues yet.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {list.map((i) => {
                          const c = counts.get(i.id) ?? { total: 0, drafts: 0 };
                          return (
                            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                              <div>
                                <Link href={`/admin/issues/${i.id}`} className="font-medium">
                                  {i.label}
                                </Link>
                                {i.legacyLabel ? <span className="ml-2 text-sm text-ink-muted">{i.legacyLabel}</span> : null}
                                <p className="text-xs text-ink-muted">
                                  {c.total} articles{c.drafts ? ` · ${c.drafts} draft` : ""}
                                </p>
                              </div>
                              {i.deleted ? (
                                <Badge variant="muted">In trash</Badge>
                              ) : i.status === "published" ? (
                                <Badge variant="green">Published</Badge>
                              ) : (
                                <Badge variant="gold">Draft</Badge>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </>
  );
}

export default function IssuesPage() {
  return (
    <>
      <AdminPageHeader
        title="Volumes and Issues"
        crumbs={[{ label: "Volumes and Issues" }]}
        description="One volume per year, each with one or more issues. Issues stay as drafts until you publish them."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MetricsChart } from "@/components/admin/metrics-chart";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/submissions/status-badge";
import { getAnalytics, parseRange, RANGES, type RangeDays } from "@/lib/admin/analytics-data";
import { requireRole } from "@/lib/auth";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/submission-status";
import { ADMIN_AREA_ROLES, isStaff } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

type Props = PageProps<"/admin">;

async function Stats({ searchParams }: { searchParams: Props["searchParams"] }) {
  const user = await requireRole(ADMIN_AREA_ROLES, "/admin");
  if (!isStaff(user.role)) redirect("/admin/reviews");

  const supabase = await createSupabaseServerClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const range = parseRange((await searchParams).range);
  const [issues, articles, drafts, submissions, pendingReviews, unread, activity, byStatus, analytics] =
    await Promise.all([
      count(
        supabase
          .from("issues")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft")
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(rejected,published,withdrawn)")
          .not("finalised_at", "is", null)
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("review_assignments")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ),
      count(
        supabase
          .from("contact_messages")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .is("deleted_at", null),
      ),
      user.role === "super_admin"
        ? supabase
            .from("audit_log")
            .select("id, action, entity_type, created_at, actor:profiles(full_name)")
            .order("created_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: null }),
      supabase.from("submissions").select("status").is("deleted_at", null).not("finalised_at", "is", null),
      getAnalytics(range),
    ]);

  const statusCounts = new Map<SubmissionStatus, number>();
  for (const row of byStatus.data ?? [])
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);

  const cards = [
    { label: "Published issues", value: issues },
    { label: "Published articles", value: articles },
    { label: "Draft articles", value: drafts },
    { label: "Open submissions", value: submissions },
    { label: "Pending reviews", value: pendingReviews },
    { label: "Unread messages", value: unread },
  ];

  return (
    <>
      <p className="mt-6 text-ink-muted">Welcome back, {user.fullName}.</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label} className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-ink-muted">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{c.value.toLocaleString("en")}</p>
          </li>
        ))}
      </ul>

      <section className="mt-10" aria-labelledby="usage-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="usage-title" className="text-lg font-semibold">
            Views and downloads
          </h2>
          <RangePicker current={range} />
        </div>
        <div className="mt-4 rounded-lg border border-line bg-white p-5">
          <MetricsChart data={analytics.series} />
          <p className="mt-3 text-xs text-ink-muted">
            Each visitor counts once per article per day. Bots are left out, and no personal data is stored.
          </p>
        </div>
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-[1fr_20rem]">
        <section aria-labelledby="top-title">
          <h2 id="top-title" className="text-lg font-semibold">
            Top 10 articles · last {range} days
          </h2>
          {analytics.top.length === 0 ? (
            <p className="mt-3 rounded-lg border border-line bg-white p-5 text-sm text-ink-muted">
              No article has been read in this period yet.
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
              {analytics.top.map((a, i) => (
                <li key={a.id} className="flex items-baseline gap-3 px-4 py-3 text-sm">
                  <span className="w-5 shrink-0 text-right text-ink-muted tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                    <Link href={`/admin/articles/${a.id}`} className="min-w-0 flex-1 font-medium text-ink">
                      {a.title}
                    </Link>
                    <span className="mt-0.5 block shrink-0 text-ink-muted tabular-nums sm:mt-0">
                      <strong className="font-semibold text-ink">{a.views.toLocaleString("en")}</strong>{" "}
                      {a.views === 1 ? "view" : "views"} ·{" "}
                      <strong className="font-semibold text-ink">{a.downloads.toLocaleString("en")}</strong>{" "}
                      {a.downloads === 1 ? "download" : "downloads"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="status-title">
          <h2 id="status-title" className="text-lg font-semibold">
            Submissions by status
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
            {SUBMISSION_STATUSES.map((status) => (
              <li key={status}>
                <Link
                  href={`/admin/submissions?status=${status}`}
                  className="flex items-center justify-between px-4 py-2.5 text-sm text-ink no-underline hover:bg-paper"
                >
                  <StatusBadge status={status} />
                  <span className="font-semibold tabular-nums">{statusCounts.get(status) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {activity.data ? (
        <section className="mt-10" aria-labelledby="activity-title">
          <h2 id="activity-title" className="text-lg font-semibold">
            Recent activity
          </h2>
          {activity.data.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
              {activity.data.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <strong className="font-semibold">{a.actor?.full_name ?? "System"}</strong>{" "}
                    {a.action.replace(/_/g, " ")} · {a.entity_type.replace(/_/g, " ")}
                  </span>
                  <time className="text-ink-muted" dateTime={a.created_at}>
                    {dateTime.format(new Date(a.created_at))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <div className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link href="/" className="font-semibold">
          View the public site →
        </Link>
      </div>
    </>
  );
}

function RangePicker({ current }: { current: RangeDays }) {
  return (
    <nav aria-label="Date range" className="flex rounded-md border border-line bg-white p-0.5 text-sm">
      {RANGES.map((days) => (
        <Link
          key={days}
          href={days === 30 ? "/admin" : `/admin?range=${days}`}
          aria-current={days === current ? "true" : undefined}
          className={`rounded px-3 py-1.5 font-medium no-underline ${
            days === current ? "bg-navy text-white" : "text-ink-muted hover:text-navy"
          }`}
          scroll={false}
        >
          {days === 365 ? "12 months" : `${days} days`}
        </Link>
      ))}
    </nav>
  );
}

export default function AdminDashboardPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader title="Dashboard" />
      <Suspense fallback={<div className="mt-8 h-60 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </>
  );
}

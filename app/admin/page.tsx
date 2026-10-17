import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { ADMIN_AREA_ROLES, isStaff } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

async function Stats() {
  const user = await requireRole(ADMIN_AREA_ROLES, "/admin");
  if (!isStaff(user.role)) redirect("/admin/reviews");

  const supabase = await createSupabaseServerClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [issues, articles, drafts, submissions, pendingReviews, unread, activity] = await Promise.all([
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
        .not("status", "in", "(rejected,published)")
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
  ]);

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
      <p className="mt-4 text-xs text-ink-muted">
        Views and downloads charts and the top articles arrive with analytics in milestone 7.
      </p>
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

export default function AdminDashboardPage() {
  return (
    <>
      <AdminPageHeader title="Dashboard" />
      <Suspense fallback={<div className="mt-8 h-60 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Stats />
      </Suspense>
    </>
  );
}

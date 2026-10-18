import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/data/feature-flags";
import { ADMIN_AREA_ROLES } from "@/lib/roles";
import { RECOMMENDATION_LABELS } from "@/lib/submission-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reviews" };
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

async function Content() {
  await requireRole(ADMIN_AREA_ROLES, "/admin/reviews");
  const flags = await getFeatureFlags();
  if (!flags.reviewer_module)
    return <p className="mt-8 text-ink-muted">The review module is switched off at the moment.</p>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("reviewer_queue");
  const today = new Date().toISOString().slice(0, 10);
  if (!data?.length) {
    return (
      <div className="mt-8">
        <EmptyState title="No manuscripts assigned to you">
          When the editors invite you to review, the manuscript appears here and you&rsquo;ll get an email.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
      {data.map((r) => (
        <li key={r.assignment_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <Link href={`/admin/reviews/${r.assignment_id}`} className="font-medium">
              {r.title}
            </Link>
            <p className="text-xs text-ink-muted">
              {r.category_name ?? "No category"} · invited {date.format(new Date(r.assigned_at))}
              {r.round > 1 ? ` · round ${r.round} (revised manuscript)` : ""}
              {r.assignment_status === "pending" && !r.response ? " · please accept or decline" : ""}
            </p>
          </div>
          {r.assignment_status === "submitted" ? (
            <Badge variant="green">
              Submitted · {r.recommendation ? RECOMMENDATION_LABELS[r.recommendation] : ""}
            </Badge>
          ) : r.due_date && r.due_date < today ? (
            <Badge variant="coral">Overdue · was due {date.format(new Date(r.due_date))}</Badge>
          ) : (
            <Badge variant="gold">
              {r.due_date ? `Due ${date.format(new Date(r.due_date))}` : "To review"}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ReviewsPage() {
  return (
    <>
      <AdminPageHeader
        title="My reviews"
        crumbs={[{ label: "Reviews" }]}
        description="Reviews are double-blind: author names are never shown to reviewers."
      />
      <Suspense fallback={<div className="mt-8 h-40 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

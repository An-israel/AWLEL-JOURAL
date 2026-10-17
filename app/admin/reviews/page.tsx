import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { ADMIN_AREA_ROLES } from "@/lib/roles";

export const metadata: Metadata = { title: "Reviews" };

async function Content() {
  await requireRole(ADMIN_AREA_ROLES, "/admin/reviews");
  return (
    <div className="mt-8">
      <EmptyState title="No manuscripts assigned to you">
        Manuscripts assigned to you for review will appear here. (The review queue is completed in milestone
        6.)
      </EmptyState>
    </div>
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

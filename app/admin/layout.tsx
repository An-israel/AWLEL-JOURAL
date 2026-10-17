import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";
import { SkipLink } from "@/components/site/skip-link";
import { Toaster } from "@/components/ui/toaster";
import { navFor } from "@/lib/admin-nav";
import { requireRole } from "@/lib/auth";
import { ADMIN_AREA_ROLES, ROLE_LABELS } from "@/lib/roles";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | AWLEL Admin" },
  robots: { index: false, follow: false },
};

async function Shell({ children }: { children: React.ReactNode }) {
  // Authors never reach the admin area; each page also checks its own roles.
  const user = await requireRole(ADMIN_AREA_ROLES, "/admin");
  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      <AdminSidebar items={navFor(user.role)} userName={user.fullName} roleLabel={ROLE_LABELS[user.role]} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-8 outline-none sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      {/* Inside the dynamic boundary: sonner reads the clock while rendering. */}
      <Toaster />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Loading the dashboard">
      <div className="hidden w-64 bg-navy-deep lg:block" />
      <div className="flex-1 animate-pulse space-y-4 p-10">
        <div className="h-8 w-64 rounded bg-line" />
        <div className="h-32 rounded bg-line" />
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <SkipLink />
      <Suspense fallback={<ShellSkeleton />}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}

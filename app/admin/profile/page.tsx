import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { ADMIN_AREA_ROLES } from "@/lib/roles";

export const metadata: Metadata = { title: "My profile" };

async function Content() {
  const user = await requireRole(ADMIN_AREA_ROLES, "/admin/profile");
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <ProfileForm
        fullName={user.fullName}
        email={user.email}
        affiliation={user.affiliation}
        orcid={user.orcid}
      />
      <PasswordForm />
    </div>
  );
}

export default function AdminProfilePage() {
  return (
    <>
      <AdminPageHeader title="My profile" crumbs={[{ label: "My profile" }]} />
      <Suspense fallback={<div className="mt-8 h-80 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}

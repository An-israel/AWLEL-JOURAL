import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdminPageHeader, EmptyState } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteDialog } from "./invite-dialog";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users and Roles" };

const PAGE_SIZE = 25;

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

type Props = PageProps<"/admin/users">;

async function UsersContent({ searchParams }: { searchParams: Props["searchParams"] }) {
  const me = await requireRole(["super_admin"], "/admin/users");
  const filters = filtersSchema.parse(await searchParams);
  const page = filters.page ?? 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.role) query = query.eq("role", filters.role);
  if (filters.status) query = query.eq("is_active", filters.status === "active");
  if (filters.q) {
    // Strip PostgREST filter syntax characters; the value is still parameterised.
    const term = filters.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error("Could not load users");

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.role) qs.set("role", filters.role);
    if (filters.status) qs.set("status", filters.status);
    if (p > 1) qs.set("page", String(p));
    return `/admin/users${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search" action="/admin/users">
        <div className="min-w-56 flex-1">
          <label htmlFor="users-q" className="text-xs font-medium text-ink-muted">
            Search name or email
          </label>
          <Input id="users-q" name="q" defaultValue={filters.q} className="mt-1" />
        </div>
        <div>
          <label htmlFor="users-role" className="text-xs font-medium text-ink-muted">
            Role
          </label>
          <NativeSelect id="users-role" name="role" defaultValue={filters.role ?? ""} className="mt-1 w-40">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="users-status" className="text-xs font-medium text-ink-muted">
            Status
          </label>
          <NativeSelect
            id="users-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="mt-1 w-36"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <p className="mt-6 mb-3 text-sm text-ink-muted">
        {total} {total === 1 ? "user" : "users"}
      </p>
      {data.length === 0 ? (
        <EmptyState title="No users match these filters">
          Try a different search, or clear the filters.
        </EmptyState>
      ) : (
        <UsersTable
          currentUserId={me.id}
          rows={data.map((u) => ({
            id: u.id,
            fullName: u.full_name,
            email: u.email,
            role: u.role,
            isActive: u.is_active,
            createdAt: u.created_at,
          }))}
        />
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

export default function UsersPage({ searchParams }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Users and Roles"
        crumbs={[{ label: "Users and Roles" }]}
        description="Invite editors, reviewers and other Super Admins, change roles and deactivate accounts. There must always be at least one active Super Admin."
        actions={<InviteDialog />}
      />
      <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

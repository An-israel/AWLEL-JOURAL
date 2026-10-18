"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ROLE_DESCRIPTIONS, SELF_DEMOTION_WARNING } from "@/lib/admin/role-help";
import { ROLE_LABELS, ROLES, type UserRole } from "@/lib/roles";
import { changeRole, setUserActive, type ActionResult } from "./actions";

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

type Pending =
  { kind: "role"; user: UserRow; role: UserRole } | { kind: "active"; user: UserRow; active: boolean } | null;

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

// Below md each row is a card with labelled fields, so phones need no
// sideways scrolling (item 82); from md up it's an ordinary table.
const CARD_LABEL = "mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase md:hidden";
const CELL = "block px-4 py-1.5 md:table-cell md:py-3 md:align-middle";
const HEAD = "h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-ink-muted uppercase";

export function UsersTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const [pending, setPending] = useState<Pending>(null);
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setPending(null);
    });
  }

  const selfDemotion =
    pending?.kind === "role" && pending.user.id === currentUserId && pending.role !== "super_admin";

  return (
    <>
      <div className="w-full rounded-lg border border-line bg-white md:overflow-x-auto">
        <table className="block w-full text-sm md:table">
          <caption className="sr-only">Users and their roles</caption>
          <thead className="hidden border-b border-line bg-paper/70 md:table-header-group">
            <tr>
              <th className={HEAD}>Name</th>
              <th className={HEAD}>Role</th>
              <th className={HEAD}>Status</th>
              <th className={HEAD}>Joined</th>
              <th className={`${HEAD} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="block divide-y divide-line md:table-row-group">
            {rows.map((u) => {
              const self = u.id === currentUserId;
              return (
                <tr
                  key={u.id}
                  aria-busy={isPending && pending?.user.id === u.id ? true : undefined}
                  className="block py-2 hover:bg-paper/50 md:table-row md:py-0"
                >
                  <td className={CELL}>
                    <p className="font-medium text-ink">
                      {u.fullName || "—"}{" "}
                      {self ? <span className="text-xs text-ink-muted">(you)</span> : null}
                    </p>
                    <p className="text-xs break-all text-ink-muted">{u.email}</p>
                  </td>
                  <td className={CELL}>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Role for {u.fullName || u.email}
                    </label>
                    <span aria-hidden className={CARD_LABEL}>
                      Role
                    </span>
                    <NativeSelect
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={isPending}
                      title={ROLE_DESCRIPTIONS[u.role]}
                      onChange={(e) =>
                        setPending({ kind: "role", user: u, role: e.target.value as UserRole })
                      }
                      className="h-9 w-full md:w-40"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className={CELL}>
                    <span aria-hidden className={CARD_LABEL}>
                      Status
                    </span>
                    {u.isActive ? (
                      <Badge variant="green">Active</Badge>
                    ) : (
                      <Badge variant="muted">Deactivated</Badge>
                    )}
                  </td>
                  <td className={`${CELL} text-ink-muted`}>
                    <span aria-hidden className={CARD_LABEL}>
                      Joined
                    </span>
                    {date.format(new Date(u.createdAt))}
                  </td>
                  <td className={`${CELL} md:text-right`}>
                    {u.isActive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={self || isPending}
                        title={self ? "You can't deactivate your own account" : undefined}
                        onClick={() => setPending({ kind: "active", user: u, active: false })}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setPending({ kind: "active", user: u, active: true })}
                      >
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !isPending && setPending(null)}
        title={
          selfDemotion
            ? `Change your own role to ${ROLE_LABELS[pending.role]}?`
            : pending?.kind === "role"
              ? `Change role to ${ROLE_LABELS[pending.role]}?`
              : pending?.kind === "active" && !pending.active
                ? "Deactivate this account?"
                : "Reactivate this account?"
        }
        description={
          selfDemotion ? (
            <>
              <strong className="text-ink">{SELF_DEMOTION_WARNING}</strong> As {ROLE_LABELS[pending.role]}:{" "}
              {ROLE_DESCRIPTIONS[pending.role]}
            </>
          ) : pending?.kind === "role" ? (
            <>
              <strong>{pending.user.fullName || pending.user.email}</strong> will become{" "}
              {ROLE_LABELS[pending.role]}. Their access changes immediately. {ROLE_DESCRIPTIONS[pending.role]}
            </>
          ) : pending?.kind === "active" && !pending.active ? (
            <>
              <strong>{pending.user.fullName || pending.user.email}</strong> will be signed out and
              won&rsquo;t be able to sign in until reactivated. Their work is kept.
            </>
          ) : (
            <>They will be able to sign in again.</>
          )
        }
        confirmLabel={
          selfDemotion
            ? "Change my role"
            : pending?.kind === "role"
              ? "Change role"
              : pending?.kind === "active" && !pending.active
                ? "Deactivate"
                : "Reactivate"
        }
        destructive={selfDemotion || (pending?.kind === "active" && !pending.active)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === "role") run(() => changeRole({ userId: pending.user.id, role: pending.role }));
          else run(() => setUserActive({ userId: pending.user.id, active: pending.active }));
        }}
      />
    </>
  );
}

/** A small key to the four roles, shown above the users list (item 84). */
export function RoleLegend() {
  return (
    <details className="mt-6 rounded-lg border border-line bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-navy">What can each role do?</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_1fr]">
        {[...ROLES].reverse().map((r) => (
          <div key={r} className="contents">
            <dt className="font-semibold text-ink">{ROLE_LABELS[r]}</dt>
            <dd className="text-ink-muted">{ROLE_DESCRIPTIONS[r]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

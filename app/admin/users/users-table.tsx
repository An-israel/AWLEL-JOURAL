"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
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

  return (
    <>
      <Table>
        <caption className="sr-only">Users and their roles</caption>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th className="hidden md:table-cell">Joined</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((u) => {
            const self = u.id === currentUserId;
            return (
              <Tr key={u.id} aria-busy={isPending && pending?.user.id === u.id ? true : undefined}>
                <Td>
                  <p className="font-medium text-ink">
                    {u.fullName || "—"} {self ? <span className="text-xs text-ink-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-ink-muted">{u.email}</p>
                </Td>
                <Td>
                  <label className="sr-only" htmlFor={`role-${u.id}`}>
                    Role for {u.fullName || u.email}
                  </label>
                  <NativeSelect
                    id={`role-${u.id}`}
                    value={u.role}
                    disabled={isPending}
                    onChange={(e) => setPending({ kind: "role", user: u, role: e.target.value as UserRole })}
                    className="h-9 w-40"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </Td>
                <Td>
                  {u.isActive ? (
                    <Badge variant="green">Active</Badge>
                  ) : (
                    <Badge variant="muted">Deactivated</Badge>
                  )}
                </Td>
                <Td className="hidden text-ink-muted md:table-cell">{date.format(new Date(u.createdAt))}</Td>
                <Td className="text-right">
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
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !isPending && setPending(null)}
        title={
          pending?.kind === "role"
            ? `Change role to ${ROLE_LABELS[pending.role]}?`
            : pending?.kind === "active" && !pending.active
              ? "Deactivate this account?"
              : "Reactivate this account?"
        }
        description={
          pending?.kind === "role" ? (
            <>
              <strong>{pending.user.fullName || pending.user.email}</strong> will become{" "}
              {ROLE_LABELS[pending.role]}. Their access changes immediately.
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
          pending?.kind === "role"
            ? "Change role"
            : pending?.kind === "active" && !pending.active
              ? "Deactivate"
              : "Reactivate"
        }
        destructive={pending?.kind === "active" && !pending.active}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === "role") run(() => changeRole({ userId: pending.user.id, role: pending.role }));
          else run(() => setUserActive({ userId: pending.user.id, active: pending.active }));
        }}
      />
    </>
  );
}

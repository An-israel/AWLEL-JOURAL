"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { SortableList } from "@/components/admin/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { reorderBoard, saveGroup, setMemberDeleted } from "./actions";

export interface BoardMemberRow {
  id: string;
  version: number;
  name: string;
  title: string | null;
  affiliation: string | null;
  needsVerification: boolean;
  deleted: boolean;
}

export interface BoardGroupRow {
  id: string;
  version: number;
  name: string;
  members: BoardMemberRow[];
}

export function BoardManager({ initial }: { initial: BoardGroupRow[] }) {
  const [groups, setGroups] = useState(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<BoardGroupRow | "new" | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const removed = initial.flatMap((g) =>
    g.members.filter((m) => m.deleted).map((m) => ({ ...m, group: g.name })),
  );
  const verifyCount = initial
    .flatMap((g) => g.members)
    .filter((m) => m.needsVerification && !m.deleted).length;

  const saveOrder = (
    table: "editorial_board_groups" | "editorial_board_members",
    ids: string[],
    key: string,
  ) =>
    start(async () => {
      const r = await reorderBoard({ table, ids });
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setDirty((d) => {
          const n = new Set(d);
          n.delete(key);
          return n;
        });
      } else toast.error(r.message);
    });

  return (
    <div className="mt-6 space-y-10">
      {verifyCount > 0 ? (
        <p className="rounded-lg border border-gold bg-[#FBF3E4] px-4 py-3 text-sm text-[#7A4F18]">
          <strong>{verifyCount} entries are marked “to be verified”.</strong> They were taken from the 2019
          issue and may be out of date. Open each one, check it, and untick the flag.
        </p>
      ) : null}

      <section aria-labelledby="groups-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="groups-title" className="text-lg font-semibold">
            Groups (order on the page)
          </h2>
          <div className="flex gap-2">
            {dirty.has("groups") ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  saveOrder(
                    "editorial_board_groups",
                    groups.map((g) => g.id),
                    "groups",
                  )
                }
              >
                Save order
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setNaming("new")}>
              <Plus aria-hidden /> New group
            </Button>
          </div>
        </div>
        <SortableList
          items={groups}
          getId={(g) => g.id}
          getLabel={(g) => g.name}
          onChange={(next) => {
            setGroups(next);
            setDirty((d) => new Set(d).add("groups"));
          }}
          render={(g) => (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{g.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setNaming(g)}>
                Rename
              </Button>
            </div>
          )}
        />
      </section>

      {groups.map((g) => {
        const members = g.members.filter((m) => !m.deleted);
        return (
          <section key={g.id} aria-labelledby={`g-${g.id}`} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`g-${g.id}`} className="text-lg font-semibold">
                {g.name} <span className="text-sm font-normal text-ink-muted">({members.length})</span>
              </h2>
              <div className="flex gap-2">
                {dirty.has(g.id) ? (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      saveOrder(
                        "editorial_board_members",
                        members.map((m) => m.id),
                        g.id,
                      )
                    }
                  >
                    Save order
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <Link href={`/admin/editorial-board/new?group=${g.id}`}>
                    <Plus aria-hidden /> Add member
                  </Link>
                </Button>
              </div>
            </div>
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-white p-5 text-center text-sm text-ink-muted">
                No members in this group.
              </p>
            ) : (
              <SortableList
                items={members}
                getId={(m) => m.id}
                getLabel={(m) => m.name}
                onChange={(next) => {
                  setGroups((all) =>
                    all.map((x) =>
                      x.id === g.id ? { ...x, members: [...next, ...x.members.filter((m) => m.deleted)] } : x,
                    ),
                  );
                  setDirty((d) => new Set(d).add(g.id));
                }}
                render={(m) => (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/editorial-board/${m.id}`} className="font-medium">
                        {m.name}
                      </Link>
                      {m.needsVerification ? (
                        <Badge variant="gold" className="ml-2">
                          To be verified
                        </Badge>
                      ) : null}
                      <p className="truncate text-xs text-ink-muted">
                        {[m.title, m.affiliation].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                )}
              />
            )}
          </section>
        );
      })}

      {removed.length > 0 ? (
        <section aria-labelledby="removed-title">
          <h2 id="removed-title" className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Removed members
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
            {removed.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  {m.name} <span className="text-ink-muted">· {m.group}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setMemberDeleted({
                        id: m.id,
                        expectedVersion: m.version,
                        deleted: false,
                      });
                      if (r.ok) window.location.reload();
                      else toast.error(r.message);
                    })
                  }
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={naming !== null} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent>
          <DialogHeader title={naming === "new" ? "New group" : "Rename group"} />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              const g = naming === "new" ? null : naming;
              start(async () => {
                const r = await saveGroup({ id: g?.id, expectedVersion: g?.version, name });
                if (!r.ok) {
                  setError(r.fieldErrors?.name ?? r.message);
                  return;
                }
                window.location.reload();
              });
            }}
          >
            <div>
              <Label htmlFor="grp-name">Name</Label>
              <Input
                id="grp-name"
                name="name"
                defaultValue={naming && naming !== "new" ? naming.name : ""}
                className="mt-1.5"
                aria-describedby="grp-name-error"
              />
              <FieldError id="grp-name-error">{error}</FieldError>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

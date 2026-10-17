"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { SortableList } from "@/components/admin/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { deleteMilestone, reorderMilestones, saveMilestone } from "../actions";

export interface Milestone {
  id: string;
  version: number;
  yearLabel: string;
  title: string;
  description: string;
  needsVerification: boolean;
}

export function MilestonesEditor({ initial }: { initial: Milestone[] }) {
  const [items, setItems] = useState(initial);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const current = editing === "new" ? null : editing;

  return (
    <section aria-labelledby="ms-title" className="mt-12 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ms-title" className="text-lg font-semibold">
          Department timeline
        </h2>
        <div className="flex gap-2">
          {orderDirty ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reorderMilestones(items.map((m) => m.id));
                  if (r.ok) {
                    setOrderDirty(false);
                    toast.success(r.message ?? "Saved");
                  } else toast.error(r.message);
                })
              }
            >
              Save order
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> Add milestone
          </Button>
        </div>
      </div>
      <SortableList
        items={items}
        getId={(m) => m.id}
        getLabel={(m) => m.title}
        onChange={(next) => {
          setItems(next);
          setOrderDirty(true);
        }}
        render={(m) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="mr-2 text-navy">{m.yearLabel}</strong>
              {m.title} {m.needsVerification ? <Badge variant="gold">To verify</Badge> : null}
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                Remove
              </Button>
            </span>
          </div>
        )}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setErrors({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader title={current ? "Edit milestone" : "Add milestone"} />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const r = await saveMilestone({
                  id: current?.id,
                  expectedVersion: current?.version,
                  yearLabel: String(fd.get("yearLabel")),
                  title: String(fd.get("title")),
                  description: String(fd.get("description") ?? ""),
                  needsVerification: fd.get("needsVerification") === "on",
                });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  return void toast.error(r.message);
                }
                toast.success(r.message ?? "Saved");
                window.location.reload();
              });
            }}
          >
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <div>
                <Label htmlFor="ms-year">Year</Label>
                <Input
                  id="ms-year"
                  name="yearLabel"
                  defaultValue={current?.yearLabel}
                  className="mt-1.5"
                  placeholder="1960"
                  aria-describedby="ms-year-error"
                />
                <FieldError id="ms-year-error">{errors.yearLabel}</FieldError>
              </div>
              <div>
                <Label htmlFor="ms-title-input">Title</Label>
                <Input
                  id="ms-title-input"
                  name="title"
                  defaultValue={current?.title}
                  className="mt-1.5"
                  aria-describedby="ms-title-error"
                />
                <FieldError id="ms-title-error">{errors.title}</FieldError>
              </div>
            </div>
            <div>
              <Label htmlFor="ms-desc">Description</Label>
              <Textarea
                id="ms-desc"
                name="description"
                rows={3}
                defaultValue={current?.description}
                className="mt-1.5"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="needsVerification"
                defaultChecked={current?.needsVerification ?? true}
              />{" "}
              Needs verification (not yet confirmed)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this milestone?"
        description={`“${removing?.title ?? ""}” will be removed from the timeline. This can't be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          const m = removing;
          if (!m) return;
          start(async () => {
            const r = await deleteMilestone(m.id);
            if (r.ok) {
              setItems((l) => l.filter((x) => x.id !== m.id));
              toast.success(r.message ?? "Removed");
            } else toast.error(r.message);
            setRemoving(null);
          });
        }}
      />
    </section>
  );
}

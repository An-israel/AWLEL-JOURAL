"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { SortableList } from "@/components/admin/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { slugify } from "@/lib/admin/slug";
import { reorderCategories, saveCategory, setCategoryArchived } from "./actions";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isArchived: boolean;
  version: number;
  articleCount: number;
}

type Editing = { row: CategoryRow | null } | null;

export function CategoriesManager({ initial }: { initial: CategoryRow[] }) {
  const [rows, setRows] = useState(initial);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [archiving, setArchiving] = useState<CategoryRow | null>(null);
  const [pending, start] = useTransition();
  const active = rows.filter((r) => !r.isArchived);
  const archived = rows.filter((r) => r.isArchived);

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Drag or use the arrows to set the order shown on the site.</p>
        <div className="flex gap-2">
          {orderDirty ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reorderCategories(active.map((c) => c.id));
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    setOrderDirty(false);
                  } else toast.error(r.message);
                })
              }
            >
              Save order
            </Button>
          ) : null}
          <Button onClick={() => setEditing({ row: null })}>
            <Plus aria-hidden /> New category
          </Button>
        </div>
      </div>

      <SortableList
        items={active}
        getId={(c) => c.id}
        getLabel={(c) => c.name}
        disabled={pending}
        onChange={(next) => {
          setRows([...next, ...archived]);
          setOrderDirty(true);
        }}
        render={(c) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-ink">{c.name}</p>
              <p className="text-xs text-ink-muted">
                /categories/{c.slug} · {c.articleCount} {c.articleCount === 1 ? "article" : "articles"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing({ row: c })}
                aria-label={`Edit ${c.name}`}
              >
                <Pencil aria-hidden /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setArchiving(c)}>
                Archive
              </Button>
            </div>
          </div>
        )}
      />

      {archived.length > 0 ? (
        <section aria-labelledby="archived-title">
          <h2 id="archived-title" className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Archived
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <span>
                  {c.name} <Badge variant="muted">Archived</Badge>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setCategoryArchived({
                        id: c.id,
                        archived: false,
                        expectedVersion: c.version,
                      });
                      if (r.ok) {
                        toast.success(r.message ?? "Restored");
                        setRows((all) =>
                          all.map((x) =>
                            x.id === c.id ? { ...x, isArchived: false, version: x.version + 1 } : x,
                          ),
                        );
                      } else toast.error(r.message);
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

      <CategoryDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => window.location.reload()}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive “${archiving?.name ?? ""}”?`}
        description="It disappears from the category grid and can't be chosen for new articles. Existing articles keep it, and you can restore it at any time."
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          const c = archiving;
          if (!c) return;
          start(async () => {
            const r = await setCategoryArchived({ id: c.id, archived: true, expectedVersion: c.version });
            if (r.ok) {
              toast.success(r.message ?? "Archived");
              setRows((all) =>
                all.map((x) => (x.id === c.id ? { ...x, isArchived: true, version: x.version + 1 } : x)),
              );
            } else toast.error(r.message);
            setArchiving(null);
          });
        }}
      />
    </div>
  );
}

function CategoryDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const row = editing?.row ?? null;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [openFor, setOpenFor] = useState<Editing>(null);

  if (editing !== openFor) {
    setOpenFor(editing);
    setName(row?.name ?? "");
    setSlug(row?.slug ?? "");
    setSlugTouched(Boolean(row));
    setDescription(row?.description ?? "");
    setErrors({});
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={row ? "Edit category" : "New category"} />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveCategory({
                id: row?.id,
                expectedVersion: row?.version,
                name,
                slug,
                description,
              });
              if (r.ok) {
                toast.success(r.message ?? "Saved");
                onSaved();
              } else {
                setErrors(r.fieldErrors ?? {});
                toast.error(r.message);
              }
            });
          }}
        >
          <div>
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              className="mt-1.5"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby="cat-name-error"
            />
            <FieldError id="cat-name-error">{errors.name}</FieldError>
          </div>
          <div>
            <Label htmlFor="cat-slug">URL slug</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              className="mt-1.5 font-mono"
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby="cat-slug-error cat-slug-hint"
            />
            <p id="cat-slug-hint" className="mt-1 text-xs text-ink-muted">
              Page address: /categories/{slug || "…"}
            </p>
            <FieldError id="cat-slug-error">{errors.slug}</FieldError>
          </div>
          <div>
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

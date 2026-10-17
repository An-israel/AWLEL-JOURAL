"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConflictBanner } from "@/components/admin/conflict-banner";
import { FileSlot } from "@/components/admin/file-slot";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { AttachedFile } from "@/lib/admin/uploads";
import { saveMember, setMemberDeleted } from "../actions";

export interface MemberData {
  id?: string;
  version?: number;
  groupId: string;
  name: string;
  title: string;
  affiliation: string;
  needsVerification: boolean;
  photo: AttachedFile | null;
}

export function MemberEditor({
  member,
  groups,
}: {
  member: MemberData;
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(member);
  const [version, setVersion] = useState(member.version ?? 0);
  const [dirty, setDirty] = useState(!member.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  useUnsavedChanges(dirty && Boolean(member.id));
  const set = <K extends keyof MemberData>(k: K, v: MemberData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      <ConflictBanner show={conflict} />
      <form
        className="space-y-4 rounded-lg border border-line bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveMember({
              ...form,
              id: member.id,
              expectedVersion: member.id ? version : undefined,
            });
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              if (r.conflict) setConflict(true);
              return void toast.error(r.message);
            }
            toast.success(r.message ?? "Saved");
            setDirty(false);
            if (!member.id && r.data) router.push(`/admin/editorial-board/${r.data.id}`);
            else if (r.data) setVersion(r.data.version);
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="m-name">Name (as it should appear)</Label>
            <Input
              id="m-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="mt-1.5"
              aria-describedby="m-name-error"
            />
            <FieldError id="m-name-error">{errors.name}</FieldError>
          </div>
          <div>
            <Label htmlFor="m-group">Group</Label>
            <NativeSelect
              id="m-group"
              value={form.groupId}
              onChange={(e) => set("groupId", e.target.value)}
              className="mt-1.5"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="m-title">Title or role (optional)</Label>
            <Input
              id="m-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="mt-1.5"
              placeholder="Editor-in-Chief"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="m-aff">Affiliation</Label>
            <Input
              id="m-aff"
              value={form.affiliation}
              onChange={(e) => set("affiliation", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.needsVerification}
            onChange={(e) => set("needsVerification", e.target.checked)}
          />
          To be verified (shown only here in the admin)
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : member.id ? "Save" : "Add member"}
          </Button>
          {member.id ? (
            <Button type="button" variant="ghost" onClick={() => setConfirmRemove(true)} disabled={pending}>
              Remove from board
            </Button>
          ) : null}
        </div>
      </form>

      {member.id ? (
        <FileSlot
          slot="board_photo"
          entityId={member.id}
          version={version}
          onVersion={setVersion}
          current={member.photo}
        />
      ) : (
        <p className="text-sm text-ink-muted">You can add a photo after saving.</p>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${member.name} from the board?`}
        description="They disappear from the public page. You can restore them from the Editorial Board screen."
        confirmLabel="Remove"
        destructive
        onConfirm={() =>
          start(async () => {
            const r = await setMemberDeleted({ id: member.id!, expectedVersion: version, deleted: true });
            if (r.ok) {
              toast.success(r.message ?? "Removed");
              router.push("/admin/editorial-board");
            } else {
              if (r.conflict) setConflict(true);
              toast.error(r.message);
            }
          })
        }
      />
    </div>
  );
}

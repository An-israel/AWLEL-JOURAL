"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { MONTHS } from "@/lib/issue-label";
import { createIssue, createVolume } from "./actions";

export function NewVolumeButton({ suggestedNumber, suggestedYear }: { suggestedNumber: number; suggestedYear: number }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New volume
      </Button>
      <DialogContent>
        <DialogHeader title="New volume" description="One volume per year. Enter both numbers: older years don't always follow the pattern." />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await createVolume({ volumeNumber: String(fd.get("volumeNumber")), year: String(fd.get("year")) });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                return void toast.error(r.message);
              }
              toast.success(r.message ?? "Created");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vol-number">Volume number</Label>
              <Input id="vol-number" name="volumeNumber" type="number" min={1} defaultValue={suggestedNumber} className="mt-1.5" aria-describedby="vol-number-error" />
              <FieldError id="vol-number-error">{errors.volumeNumber}</FieldError>
            </div>
            <div>
              <Label htmlFor="vol-year">Year</Label>
              <Input id="vol-year" name="year" type="number" min={1990} defaultValue={suggestedYear} className="mt-1.5" aria-describedby="vol-year-error" />
              <FieldError id="vol-year-error">{errors.year}</FieldError>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Create volume
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddIssueButton({ volumeId, volumeNumber, nextIssue }: { volumeId: string; volumeNumber: number; nextIssue: number }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add issue
      </Button>
      <DialogContent>
        <DialogHeader title={`Add an issue to Volume ${volumeNumber}`} description="The issue starts as a draft; nothing appears on the site until you publish it." />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await createIssue({
                volumeId,
                issueNumber: String(fd.get("issueNumber")),
                month: fd.get("month") ? String(fd.get("month")) : undefined,
                legacyNumber: fd.get("legacyNumber") ? String(fd.get("legacyNumber")) : undefined,
              });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                return void toast.error(r.message);
              }
              toast.success(r.message ?? "Created");
              router.push(`/admin/issues/${r.data?.id}`);
            });
          }}
        >
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="iss-number">Issue no.</Label>
              <Input id="iss-number" name="issueNumber" type="number" min={1} defaultValue={nextIssue} className="mt-1.5" aria-describedby="iss-number-error" />
              <FieldError id="iss-number-error">{errors.issueNumber}</FieldError>
            </div>
            <div>
              <Label htmlFor="iss-month">Month</Label>
              <NativeSelect id="iss-month" name="month" defaultValue="" className="mt-1.5">
                <option value="">—</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="iss-legacy">Legacy no.</Label>
              <Input id="iss-legacy" name="legacyNumber" type="number" min={1} placeholder="e.g. 19" className="mt-1.5" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Create draft issue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

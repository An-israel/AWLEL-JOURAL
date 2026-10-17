"use client";

import { ExternalLink, FileUp, History, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { SLOT_RULES, type FileSlot as Slot } from "@/lib/admin/file-slots";
import { uploadToSlot } from "@/lib/admin/upload-client";
import {
  listFileVersions,
  setSlotFile,
  staffFileUrl,
  type AttachedFile,
  type FileVersion,
} from "@/lib/admin/uploads";
import { cn } from "@/lib/utils";

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * One file attached to an issue, article, board member or the site
 * settings: shows the current file, uploads or replaces it (keeping the old
 * one as a version), and restores earlier versions.
 */
export function FileSlot({
  slot,
  entityId,
  version,
  onVersion,
  current,
}: {
  slot: Slot;
  entityId: string;
  version: number;
  onVersion: (version: number) => void;
  current: AttachedFile | null;
}) {
  const rule = SLOT_RULES[slot];
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<AttachedFile | null>(current);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = progress !== null || pending;

  async function upload(f: File) {
    setProgress(0);
    const result = await uploadToSlot(slot, entityId, f, version, setProgress);
    setProgress(null);
    if (!result.ok) return toast.error(result.message);
    if (result.data) {
      setFile(result.data.file);
      onVersion(result.data.version);
      setVersions(null);
    }
    toast.success(result.message ?? "Uploaded");
  }

  function open(fileId: string) {
    startTransition(async () => {
      const r = await staffFileUrl(fileId);
      if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener");
      else if (!r.ok) toast.error(r.message);
    });
  }

  function showVersions() {
    startTransition(async () => {
      const r = await listFileVersions({ slot, entityId });
      if (r.ok) setVersions(r.data ?? []);
      else toast.error(r.message);
    });
  }

  function choose(fileId: string | null, restored?: FileVersion) {
    startTransition(async () => {
      const r = await setSlotFile({ slot, entityId, fileId, expectedVersion: version });
      if (!r.ok) return void toast.error(r.message);
      if (r.data) onVersion(r.data.version);
      setFile(restored ?? null);
      setVersions(null);
      toast.success(r.message ?? "Saved");
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4 transition-colors",
        dragOver ? "border-royal bg-[#E8EDFA]" : "border-line",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !busy) void upload(f);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{rule.label}</p>
          {file ? (
            <p className="mt-1 text-sm text-ink-muted">
              <span className="font-medium break-all text-ink">{file.originalName}</span> ·{" "}
              {size(file.sizeBytes)} · uploaded {date.format(new Date(file.createdAt))}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              No file yet. Drop a {rule.extensions.join(" / ")} file here (max{" "}
              {Math.round(rule.maxBytes / 1024 / 1024)} MB).
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {file ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => open(file.id)} disabled={busy}>
              <ExternalLink aria-hidden /> Open
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={showVersions} disabled={busy}>
            <History aria-hidden /> Versions
          </Button>
          {file ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
            >
              <Trash2 aria-hidden /> Remove
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            <FileUp aria-hidden /> {file ? "Replace" : "Upload"}
          </Button>
          <input
            ref={input}
            type="file"
            accept={[...rule.extensions, ...rule.mimes].join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label={`Choose ${rule.label.toLowerCase()}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      </div>

      {progress !== null ? (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-royal transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">Uploading… {Math.round(progress * 100)}%</p>
        </div>
      ) : null}

      {versions ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Version history</p>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No uploads yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="break-all">{v.originalName}</span>{" "}
                    <span className="text-ink-muted">
                      · {date.format(new Date(v.createdAt))}
                      {v.uploadedBy ? ` · ${v.uploadedBy}` : ""}
                    </span>
                  </span>
                  {file?.id === v.id ? (
                    <span className="text-xs font-semibold text-[#2F6B22]">Current</span>
                  ) : (
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => open(v.id)}
                        disabled={busy}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => choose(v.id, v)}
                        disabled={busy}
                      >
                        Restore
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove the ${rule.label.toLowerCase()}?`}
        description="It will no longer be shown or downloadable. The file stays in the version history and can be restored."
        confirmLabel="Remove"
        destructive
        onConfirm={() => choose(null)}
      />
    </div>
  );
}

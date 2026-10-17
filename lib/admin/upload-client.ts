"use client";

import { publicEnv } from "@/lib/env.public";
import { checkFile, type FileSlot } from "./file-slots";
import type { ActionResult } from "./result";
import { attachUpload, requestUpload, type AttachedFile } from "./uploads";

/**
 * Uploads one file into a slot: signed URL → direct PUT to Supabase Storage
 * (with progress) → attach. Returns the entity's new version.
 */
export async function uploadToSlot(
  slot: FileSlot,
  entityId: string,
  file: File,
  expectedVersion: number,
  onProgress?: (fraction: number) => void,
): Promise<ActionResult<{ version: number; file: AttachedFile }>> {
  const problem = checkFile(slot, file);
  if (problem) return { ok: false, message: problem };

  const ticket = await requestUpload({ slot, entityId, fileName: file.name, mimeType: file.type, size: file.size });
  if (!ticket.ok || !ticket.data) return ticket.ok ? { ok: false, message: "Upload failed." } : ticket;
  const { bucket, path, token } = ticket.data;

  const url = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?token=${encodeURIComponent(token)}`;

  const uploaded = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("apikey", publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.timeout = 15 * 60 * 1000;
    xhr.send(file);
  });
  if (!uploaded) return { ok: false, message: `${file.name} could not be uploaded. Check your connection and try again.` };
  onProgress?.(1);

  return attachUpload({ slot, entityId, path, fileName: file.name, mimeType: file.type, size: file.size, expectedVersion });
}

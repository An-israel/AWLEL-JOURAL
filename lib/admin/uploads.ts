"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { TAGS } from "@/lib/data/tags";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkFile, safeFileName, SITE_ENTITY_IDS, SLOT_RULES, type FileSlot } from "./file-slots";
import { CONFLICT_MESSAGE, forbiddenResult, fromDbError, type ActionResult } from "./result";
import { expireCatalog } from "./revalidate";

/*
 * File uploads (sections 8, item 90). Files never pass through a Vercel
 * function: the browser asks for a short-lived signed upload URL, uploads
 * straight to Supabase Storage, then calls `attachUpload`. Attaching is a
 * small saga (item 19):
 *   1. check the object really exists where we said it would be
 *   2. record it in `stored_files`
 *   3. point the issue/article/etc. at it (optimistic version check)
 * If 2 or 3 fails, the object and any row from 2 are removed again, so
 * storage and database never drift apart. Replaced files are kept as
 * earlier versions and can be restored.
 */

const slotSchema = z.enum(Object.keys(SLOT_RULES) as [FileSlot, ...FileSlot[]]);
const SITE_ROW = 1;

async function authorise(slot: FileSlot) {
  const rule = SLOT_RULES[slot];
  return userWithRole(rule.superAdminOnly ? ["super_admin"] : ["super_admin", "editor"]);
}

function entityKey(slot: FileSlot, entityId: string): string {
  return SITE_ENTITY_IDS[slot] ?? entityId;
}

function expire(slot: FileSlot, entityId: string) {
  const { table } = SLOT_RULES[slot];
  if (table === "issues") expireCatalog({ issueIds: [entityId] });
  else if (table === "articles") expireCatalog({ articleIds: [entityId] });
  else if (table === "editorial_board_members") updateTag(TAGS.board);
  else updateTag(TAGS.siteSettings);
}

/** Points the entity's file column at `fileId` if its version still matches. */
async function setEntityFile(
  slot: FileSlot,
  entityId: string,
  fileId: string | null,
  expectedVersion: number,
) {
  const rule = SLOT_RULES[slot];
  const supabase = await createSupabaseServerClient();
  // Table and column come from SLOT_RULES (a fixed whitelist), never from input.
  const query = supabase
    .from(rule.table)
    .update({ [rule.column]: fileId } as never)
    .eq("version", expectedVersion);
  const scoped = rule.table === "site_settings" ? query.eq("id", SITE_ROW) : query.eq("id", entityId);
  const { data, error } = await scoped.select("version").maybeSingle();
  if (error) return { error: fromDbError(error, "file") };
  if (!data) return { error: { ok: false as const, message: CONFLICT_MESSAGE, conflict: true } };
  return { version: (data as { version: number }).version };
}

const requestSchema = z.object({
  slot: slotSchema,
  entityId: z.uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200),
  size: z.number().int().positive(),
});

export async function requestUpload(
  input: z.infer<typeof requestSchema>,
): Promise<ActionResult<{ bucket: string; path: string; token: string }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid upload request." };
  const { slot, entityId, fileName, mimeType, size } = parsed.data;
  if (!(await authorise(slot))) return forbiddenResult;

  const problem = checkFile(slot, { name: fileName, type: mimeType, size });
  if (problem) return { ok: false, message: problem };

  const rule = SLOT_RULES[slot];
  const path = `${slot}/${entityKey(slot, entityId)}/${randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(rule.bucket)
    .createSignedUploadUrl(path);
  if (error || !data) {
    logger.error({ err: error?.message, slot }, "could not create signed upload URL");
    return { ok: false, message: "The upload could not be started. Please try again." };
  }
  return { ok: true, data: { bucket: rule.bucket, path: data.path, token: data.token } };
}

const attachSchema = requestSchema.extend({
  path: z.string().min(1).max(600),
  expectedVersion: z.number().int(),
});

export interface AttachedFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

export async function attachUpload(
  input: z.infer<typeof attachSchema>,
): Promise<ActionResult<{ version: number; file: AttachedFile }>> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid upload." };
  const { slot, entityId, path, fileName, mimeType, size, expectedVersion } = parsed.data;
  const user = await authorise(slot);
  if (!user) return forbiddenResult;

  const rule = SLOT_RULES[slot];
  const key = entityKey(slot, entityId);
  // The path must be one this action could have issued for this slot and entity.
  if (!path.startsWith(`${slot}/${key}/`) || path.includes(".."))
    return { ok: false, message: "Invalid upload path." };

  const admin = createSupabaseAdminClient();
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listing } = await admin.storage.from(rule.bucket).list(dir, { search: name, limit: 1 });
  const object = listing?.find((o) => o.name === name);
  if (!object) return { ok: false, message: "The upload didn't finish. Please try again." };

  const compensate = async (fileId?: string) => {
    if (fileId) await admin.from("stored_files").delete().eq("id", fileId);
    await admin.storage.from(rule.bucket).remove([path]);
  };

  // Step 2: record the file (as the editor, so RLS and uploaded_by apply).
  const supabase = await createSupabaseServerClient();
  const { data: stored, error: storeError } = await supabase
    .from("stored_files")
    .insert({
      bucket: rule.bucket,
      path,
      original_name: fileName,
      mime_type: mimeType,
      size_bytes: (object.metadata?.size as number | undefined) ?? size,
      file_role: rule.fileRole,
      entity_id: key,
      uploaded_by: user.id,
    })
    .select("id, original_name, size_bytes, created_at")
    .single();
  if (storeError || !stored) {
    await compensate();
    return fromDbError(storeError ?? { message: "insert failed" }, "file");
  }

  // Step 3: point the entity at it.
  const result = await setEntityFile(slot, entityId, stored.id, expectedVersion);
  if ("error" in result) {
    await compensate(stored.id);
    return result.error as ActionResult<never>;
  }

  expire(slot, entityId);
  return {
    ok: true,
    message: `${rule.label} uploaded.`,
    data: {
      version: result.version,
      file: {
        id: stored.id,
        originalName: stored.original_name,
        sizeBytes: stored.size_bytes,
        createdAt: stored.created_at,
      },
    },
  };
}

const slotRefSchema = z.object({ slot: slotSchema, entityId: z.uuid() });

export interface FileVersion extends AttachedFile {
  uploadedBy: string | null;
}

export async function listFileVersions(
  input: z.infer<typeof slotRefSchema>,
): Promise<ActionResult<FileVersion[]>> {
  const parsed = slotRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (!(await authorise(parsed.data.slot))) return forbiddenResult;
  const rule = SLOT_RULES[parsed.data.slot];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stored_files")
    .select("id, original_name, size_bytes, created_at, uploader:profiles(full_name)")
    .eq("entity_id", entityKey(parsed.data.slot, parsed.data.entityId))
    .eq("file_role", rule.fileRole)
    .like("path", `${parsed.data.slot}/%`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return fromDbError(error, "file");
  return {
    ok: true,
    data: data.map((f) => ({
      id: f.id,
      originalName: f.original_name,
      sizeBytes: f.size_bytes,
      createdAt: f.created_at,
      uploadedBy: f.uploader?.full_name ?? null,
    })),
  };
}

const restoreSchema = slotRefSchema.extend({
  fileId: z.uuid().nullable(),
  expectedVersion: z.number().int(),
});

/** Restores an earlier version (or, with fileId null, detaches the file). */
export async function setSlotFile(
  input: z.infer<typeof restoreSchema>,
): Promise<ActionResult<{ version: number }>> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { slot, entityId, fileId, expectedVersion } = parsed.data;
  if (!(await authorise(slot))) return forbiddenResult;

  if (fileId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("stored_files")
      .select("id")
      .eq("id", fileId)
      .eq("entity_id", entityKey(slot, entityId))
      .eq("file_role", SLOT_RULES[slot].fileRole)
      .maybeSingle();
    if (!data) return { ok: false, message: "That file version doesn't belong here." };
  }
  const result = await setEntityFile(slot, entityId, fileId, expectedVersion);
  if ("error" in result) return result.error as ActionResult<never>;
  expire(slot, entityId);
  return {
    ok: true,
    message: fileId
      ? "Earlier version restored."
      : `${SLOT_RULES[slot].label} removed. It stays in the version history.`,
    data: { version: result.version },
  };
}

/** Short-lived link so staff can open any stored version (published or not). */
export async function staffFileUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  if (!z.uuid().safeParse(fileId).success) return { ok: false, message: "Invalid file." };
  if (!(await userWithRole(["super_admin", "editor"]))) return forbiddenResult;
  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase
    .from("stored_files")
    .select("bucket, path, original_name")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return { ok: false, message: "File not found." };
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(file.bucket)
    .createSignedUrl(file.path, 300, { download: file.original_name });
  if (error || !data) return { ok: false, message: "Could not open the file." };
  return { ok: true, data: { url: data.signedUrl } };
}

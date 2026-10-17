import "server-only";
import type { AttachedFile } from "./uploads";

export interface StoredFileRow {
  id: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
}

export function toAttached(row: StoredFileRow | null | undefined): AttachedFile | null {
  return row
    ? { id: row.id, originalName: row.original_name, sizeBytes: row.size_bytes, createdAt: row.created_at }
    : null;
}

export const FILE_COLUMNS = "id, original_name, size_bytes, created_at";

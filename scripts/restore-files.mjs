#!/usr/bin/env node
// Uploads the stored files from an unpacked awlel-files-*.tar.gz back into
// Supabase Storage (item 83). Existing files with the same path are replaced.
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (of the TARGET project)
// Usage: node scripts/restore-files.mjs <unpacked-dir>
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2];
if (!dir || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Usage: restore-files.mjs <unpacked-dir> (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
  );
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};

let count = 0;
for (const bucket of await readdir(dir, { withFileTypes: true })) {
  if (!bucket.isDirectory()) continue; // manifest.json
  const root = join(dir, bucket.name);
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const path = relative(root, full).split("\\").join("/");
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    const { error } = await supabase.storage.from(bucket.name).upload(path, await readFile(full), {
      upsert: true,
      contentType: TYPES[ext] ?? "application/octet-stream",
    });
    if (error) throw new Error(`${bucket.name}/${path}: ${error.message}`);
    count++;
  }
}
console.log(`Restored ${count} files.`);

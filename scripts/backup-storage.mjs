#!/usr/bin/env node
// Downloads every file in the journal's storage buckets into a folder, keeping
// the bucket/path layout, so the backup workflow can archive it (item 84).
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Usage: node scripts/backup-storage.mjs <output-dir> [--list-only]
//   --list-only writes <output-dir>/manifest.json (every file's bucket, path,
//   size and date) without downloading anything.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const out = process.argv[2];
const listOnly = process.argv.includes("--list-only");
if (!out || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Usage: backup-storage.mjs <output-dir> (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
  );
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BUCKETS = ["issue-covers", "site-assets", "published-files", "submissions"];

async function* walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id; recurse into them.
      if (entry.id === null) yield* walk(bucket, path);
      else yield { path, size: entry.metadata?.size ?? null, updated: entry.updated_at };
    }
    if (data.length < 1000) return;
  }
}

let count = 0;
let bytes = 0;
const manifest = [];
for (const bucket of BUCKETS) {
  for await (const file of walk(bucket)) {
    manifest.push({ bucket, ...file });
    if (listOnly) continue;
    const { data, error } = await supabase.storage.from(bucket).download(file.path);
    if (error) throw new Error(`${bucket}/${file.path}: ${error.message}`);
    const target = join(out, bucket, file.path);
    await mkdir(dirname(target), { recursive: true });
    const buffer = Buffer.from(await data.arrayBuffer());
    await writeFile(target, buffer);
    count++;
    bytes += buffer.length;
  }
}
await mkdir(out, { recursive: true });
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(
  listOnly
    ? `Listed ${manifest.length} files in ${BUCKETS.join(", ")}`
    : `Downloaded ${count} files (${(bytes / 1024 / 1024).toFixed(1)} MB) from ${BUCKETS.join(", ")}`,
);

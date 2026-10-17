#!/usr/bin/env node
// Uploads a backup file to the "AWLEL backups" folder in Google Drive and
// keeps only the newest N backups there (item 84). Uses an OAuth refresh
// token, because Google gives service accounts no storage of their own in a
// personal Drive. The token only has the drive.file scope: the script can see
// and change only the folder and files it created itself, nothing else in the
// Drive. The folder is created on the first run.
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// Usage: node scripts/upload-to-drive.mjs <file> [--keep 12] [--prefix awlel-db-]
// How to create the credentials: docs/RUNBOOK.md, "Backups".
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const [file, ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const keep = Number(option("keep", "12"));
const prefix = option("prefix", "awlel-");

const env = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
const FOLDER_NAME = "AWLEL backups";
const missing = env.filter((k) => !process.env[k]);
if (!file || missing.length) {
  console.error(
    file ? `Missing environment variables: ${missing.join(", ")}` : "Usage: upload-to-drive.mjs <file>",
  );
  process.exit(1);
}

async function call(url, init, what) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error(`${what} failed: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const { access_token: token } = await call(
  "https://oauth2.googleapis.com/token",
  {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  },
  "Google sign-in",
);
const auth = { Authorization: `Bearer ${token}` };

// The app's own folder: find it, or create it on the first run.
const folderQuery = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
const found = await call(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)`,
  { headers: auth },
  "Finding the backup folder",
);
const folder =
  found.files[0]?.id ??
  (
    await call(
      "https://www.googleapis.com/drive/v3/files?fields=id",
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
      },
      "Creating the backup folder",
    )
  ).id;

// Resumable upload: works for files of any size.
const name = basename(file);
const data = await readFile(file);
const session = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
  method: "POST",
  headers: {
    ...auth,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Length": String(data.length),
  },
  body: JSON.stringify({ name, parents: [folder] }),
});
if (!session.ok) throw new Error(`Starting the upload failed: ${session.status} ${await session.text()}`);
const uploaded = await call(
  session.headers.get("location"),
  { method: "PUT", headers: { "Content-Length": String(data.length) }, body: data },
  "Upload",
);
console.log(
  `Uploaded ${name} (${(data.length / 1024 / 1024).toFixed(1)} MB) to Google Drive as ${uploaded.id}`,
);

// Retention: newest `keep` files with this prefix stay, older ones go to the bin.
const q = `'${folder}' in parents and name contains '${prefix}' and trashed = false`;
const { files } = await call(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=200&fields=files(id,name)`,
  { headers: auth },
  "Listing backups",
);
for (const old of files.filter((f) => f.name.startsWith(prefix)).slice(keep)) {
  await call(
    `https://www.googleapis.com/drive/v3/files/${old.id}`,
    {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
    `Removing ${old.name}`,
  );
  console.log(`Moved old backup ${old.name} to the Drive bin`);
}

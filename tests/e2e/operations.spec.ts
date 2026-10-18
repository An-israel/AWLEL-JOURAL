import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  adminClient,
  createUser,
  resetRateLimits,
  signInAndWait,
  SUPER_ADMIN,
  TEST_PASSWORD,
} from "./helpers";

// Milestone 8: cron endpoints, the queue worker, dead letters, webhooks,
// backup reports, the Operations and Audit Log pages and live notices.
test.describe.configure({ mode: "serial" });

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";
const auth = { Authorization: `Bearer ${CRON_SECRET}` };

test.beforeAll(() => {
  if (!CRON_SECRET || !WEBHOOK_SECRET)
    throw new Error("Set CRON_SECRET and RESEND_WEBHOOK_SECRET in .env.local");
});

test.beforeEach(async () => {
  await resetRateLimits();
});

function signed(body: string, id = `msg_${randomUUID()}`) {
  const ts = Math.floor(Date.now() / 1000);
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    data: body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": `v1,${sig}`,
    },
  };
}

test("cron endpoints need the secret and run the queue", async ({ request }) => {
  expect((await request.get("/api/cron/queue")).status()).toBe(401);
  expect(
    (await request.get("/api/cron/queue", { headers: { Authorization: "Bearer wrong" } })).status(),
  ).toBe(401);
  expect((await request.get("/api/cron/nightly", { headers: auth })).status()).toBe(404);

  const db = adminClient();
  const key = `e2e-queue:${randomUUID()}`;
  await db.from("jobs").insert({
    job_type: "email.send",
    payload: { to: "reader@example.com", subject: "Queued by the e2e test", text: "Hello" },
    idempotency_key: key,
  });
  const response = await request.get("/api/cron/queue", { headers: auth });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.reports.map((r: { task: string; status: string }) => `${r.task}:${r.status}`)).toEqual([
    "queue:succeeded",
    "alerts:succeeded",
    "frequent:succeeded",
  ]);
  // Email isn't set up in tests (no RESEND_API_KEY or EMAIL_FROM), so the
  // email waits in the queue for later, without using up an attempt.
  const { data: job } = await db
    .from("jobs")
    .select("status, attempts, run_at")
    .eq("idempotency_key", key)
    .single();
  expect(job?.status).toBe("queued");
  expect(job?.attempts).toBe(0);
  expect(new Date(job!.run_at).getTime()).toBeGreaterThan(Date.now());
});

test("a job that can't succeed is dead-lettered and can be discarded", async ({ page, request }) => {
  const db = adminClient();
  const key = `e2e-dead:${randomUUID()}`;
  await db.from("jobs").insert({ job_type: "test.unknown", payload: {}, idempotency_key: key });
  await request.get("/api/cron/queue", { headers: auth });
  const { data: dead } = await db
    .from("dead_letter_jobs")
    .select("id, last_error")
    .eq("idempotency_key", key)
    .single();
  expect(dead?.last_error).toContain("No handler for job type test.unknown");

  await signInAndWait(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto("/admin/operations");
  await expect(page.getByRole("link", { name: /step-by-step guide/ })).toHaveAttribute(
    "href",
    /github\.com\/.*\/docs\/RUNBOOK\.md$/,
  );
  await expect(page.getByRole("status").first()).toContainText("failed for good");
  const row = page.getByRole("listitem").filter({ hasText: "No handler for job type test.unknown" });
  await row.getByRole("button", { name: "Discard" }).click();
  // Discarding asks first and says what is lost.
  const confirm = page.getByRole("alertdialog", { name: "Discard this failed job?" });
  await expect(confirm).toContainText("won't be tried again");
  await confirm.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("Discarded.")).toBeVisible();
  await expect(row).toHaveCount(0);

  // The audit log records it, and filters work.
  await page.goto("/admin/audit-log?action=dead_letter_discarded");
  const entry = page.getByRole("list", { name: "Audit log entries" }).getByRole("listitem").first();
  await expect(entry).toContainText("Failed job discarded");
  await expect(entry).not.toContainText("by the system");
});

test("bounce webhooks are verified, processed once and suppress the address", async ({ page, request }) => {
  const email = `bounced-${Date.now()}@example.com`;
  const body = JSON.stringify({
    type: "email.bounced",
    data: { to: [email], bounce: { type: "Permanent" } },
  });
  expect(
    (await request.post("/api/webhooks/resend", { data: body, headers: { "svix-id": "x" } })).status(),
  ).toBe(401);

  const delivery = signed(body);
  const first = await request.post("/api/webhooks/resend", delivery);
  expect(first.status()).toBe(200);
  const again = await request.post("/api/webhooks/resend", delivery);
  expect(await again.json()).toMatchObject({ duplicate: true });

  await signInAndWait(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto("/admin/operations");
  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row).toContainText("bounced");
  await row.getByRole("button", { name: "Allow again" }).click();
  await expect(page.getByText(`${email} will receive emails again.`)).toBeVisible();
});

test("backup reports, scheduled-task history and Run now", async ({ page, request }) => {
  const report = await request.post("/api/cron/heartbeat", {
    headers: { ...auth, "content-type": "application/json" },
    data: { task: "backup", status: "succeeded", detail: { file: "awlel-db-test.tar.gz", bytes: 1234 } },
  });
  expect(report.status()).toBe(200);
  expect(
    (await request.post("/api/cron/heartbeat", { data: { task: "backup", status: "succeeded" } })).status(),
  ).toBe(401);

  await signInAndWait(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto("/admin/operations");
  const backup = page.getByRole("row", { name: /^Backup / });
  await expect(backup).toContainText("Succeeded");
  await expect(page.getByRole("status").first()).not.toContainText("No backup");

  const cleanup = page.getByRole("row", { name: /^Cleanup / });
  await cleanup.getByRole("button", { name: "Run cleanup now" }).click();
  await expect(page.getByText(/^Done: orphaned files \d+/)).toBeVisible();
  await expect(cleanup).toContainText("Succeeded");
});

test("editors see new submissions live, but not the Super Admin pages", async ({ page }) => {
  const editor = await createUser("editor", "ops-editor");
  await signInAndWait(page, editor.email, TEST_PASSWORD);
  await page.goto("/admin");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Operations" })).toHaveCount(0);
  // Give the realtime subscription a moment to join.
  await page.waitForTimeout(2_000);
  const id = randomUUID();
  await adminClient()
    .from("domain_events")
    .insert({ event_type: "submission.created", aggregate_type: "submission", aggregate_id: id });
  const notice = page.getByText("New manuscript submitted");
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/submissions/${id}$`));

  for (const path of ["/admin/operations", "/admin/audit-log"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/no-access$/);
  }
});

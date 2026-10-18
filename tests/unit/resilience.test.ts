import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Failure drills (item 87): the email provider and storage fail, and the
 * system must degrade the way it is designed to. The database is a fake that
 * records every RPC, so each test can check what the worker decided.
 */

type Result = { data: unknown; error: unknown };
const rpcResults = new Map<string, Result | ((args: Record<string, unknown>) => Result)>();
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const tableResults = new Map<string, Result>();
const tableCalls: { table: string; method: string }[] = [];
const storage = { createSignedUrl: vi.fn() };
const mockEnv = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
const configuredEnv = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "AWLEL <no-reply@test>",
  METRICS_SALT: "x".repeat(32),
};

/** A chainable query builder that resolves to the table's canned result. */
function query(table: string) {
  const result = tableResults.get(table) ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "in",
    "order",
    "limit",
    "lte",
    "gt",
    "is",
    "insert",
    "update",
    "upsert",
    "delete",
  ])
    builder[m] = () => {
      tableCalls.push({ table, method: m });
      return builder;
    };
  builder.single = builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const fakeClient = {
  rpc: (name: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ name, args });
    const r = rpcResults.get(name);
    return Promise.resolve(typeof r === "function" ? r(args) : (r ?? { data: null, error: null }));
  },
  from: query,
  storage: { from: () => storage },
};

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fakeClient }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => fakeClient }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => mockEnv.value }));
vi.mock("@/lib/data/catalog", () => ({
  getPublishedIssues: async () => [
    { id: "issue-1", volumeNumber: 25, issueNumber: 1, issuesInVolume: 2, year: 2025 },
  ],
}));

const { runJobNow, EMAIL_SETUP_RETRY_MS } = await import("@/lib/server/jobs");
const { downloadIssue } = await import("@/lib/server/downloads");

const job = {
  id: 7,
  job_type: "email.send",
  payload: { to: "author@example.com", subject: "Hello", text: "Hi" },
  idempotency_key: "test:7",
  attempts: 0,
};

beforeEach(() => {
  mockEnv.value = { ...configuredEnv };
  rpcCalls.length = 0;
  tableCalls.length = 0;
  rpcResults.clear();
  tableResults.clear();
  rpcResults.set("claim_job", { data: [job], error: null });
  rpcResults.set("breaker_allows", { data: true, error: null });
  rpcResults.set("fail_job", { data: "retry", error: null });
  tableResults.set("email_suppressions", { data: [], error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  storage.createSignedUrl.mockReset();
});

const called = (name: string) => rpcCalls.filter((c) => c.name === name);

describe("when the email provider fails", () => {
  it("retries a 503 with backoff and counts it against the circuit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    expect(await runJobNow(7)).toBe(false);
    expect(called("breaker_record")).toEqual([
      { name: "breaker_record", args: { p_name: "resend", p_ok: false } },
    ]);
    expect(called("fail_job")[0].args).toMatchObject({ p_id: 7, p_retryable: true });
    expect(called("finish_job")).toHaveLength(0);
  });

  it("treats a timeout like an outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      }),
    );
    await runJobNow(7);
    expect(called("fail_job")[0].args).toMatchObject({ p_retryable: true });
  });

  it("dead-letters a 422 at once and leaves the circuit alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 422 })),
    );
    rpcResults.set("fail_job", { data: "dead", error: null });
    await runJobNow(7);
    expect(called("fail_job")[0].args).toMatchObject({ p_retryable: false });
    expect(called("breaker_record")).toHaveLength(0);
  });

  it("stops calling the provider while the circuit is open, without using up attempts", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    rpcResults.set("breaker_allows", { data: false, error: null });
    await runJobNow(7);
    expect(fetch).not.toHaveBeenCalled();
    expect(called("defer_job")).toHaveLength(1);
    expect(called("fail_job")).toHaveLength(0);
  });

  it("still sends when the circuit state can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "em_1" })),
    );
    rpcResults.set("breaker_allows", { data: null, error: { message: "db down" } });
    expect(await runJobNow(7)).toBe(true);
    expect(called("finish_job")).toHaveLength(1);
  });

  it("skips addresses that bounced", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    tableResults.set("email_suppressions", { data: [{ email: "author@example.com" }], error: null });
    expect(await runJobNow(7)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("when email isn't set up yet", () => {
  for (const [what, env] of [
    ["no RESEND_API_KEY or EMAIL_FROM", { METRICS_SALT: configuredEnv.METRICS_SALT }],
    ["RESEND_API_KEY without EMAIL_FROM", { ...configuredEnv, EMAIL_FROM: undefined }],
  ] as const) {
    it(`keeps the email queued for later, without using up an attempt (${what})`, async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      mockEnv.value = env;
      expect(await runJobNow(7)).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(called("defer_job")).toEqual([
        { name: "defer_job", args: { p_id: 7, p_retry_in_ms: EMAIL_SETUP_RETRY_MS } },
      ]);
      expect(called("fail_job")).toHaveLength(0);
      expect(called("finish_job")).toHaveLength(0);
    });
  }

  it("sends the waiting email on the first run after it is set up", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "em_1" }));
    vi.stubGlobal("fetch", fetch);
    rpcResults.set("claim_job", {
      data: [{ ...job, created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }],
      error: null,
    });
    expect(await runJobNow(7)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(called("finish_job")).toHaveLength(1);
  });

  it("drops an email that has waited over two weeks, instead of sending it late", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    rpcResults.set("claim_job", {
      data: [{ ...job, created_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }],
      error: null,
    });
    expect(await runJobNow(7)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(tableCalls).toContainEqual({ table: "jobs", method: "delete" });
    expect(called("fail_job")).toHaveLength(0);
    expect(called("defer_job")).toHaveLength(0);
  });
});

describe("when storage fails", () => {
  it("answers downloads with a clear 503 and Retry-After instead of a crash", async () => {
    tableResults.set("issues", {
      data: { full_pdf_file_id: "file-1", full_docx_file_id: null },
      error: null,
    });
    tableResults.set("stored_files", { data: { bucket: "published-files", path: "x.pdf" }, error: null });
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: "storage unavailable" } });
    const headers = new Headers({ "user-agent": "curl/8" }); // a bot, so nothing is recorded
    await expect(downloadIssue(headers, "issue-1", "pdf")).rejects.toMatchObject({
      status: 503,
      code: "storage_unavailable",
      headers: { "Retry-After": "120" },
    });
  });

  it("still serves the file when storage answers", async () => {
    tableResults.set("issues", {
      data: { full_pdf_file_id: "file-1", full_docx_file_id: null },
      error: null,
    });
    tableResults.set("stored_files", { data: { bucket: "published-files", path: "x.pdf" }, error: null });
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://files.example/x.pdf?token=1" },
      error: null,
    });
    const response = await downloadIssue(new Headers({ "user-agent": "curl/8" }), "issue-1", "pdf");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://files.example/x.pdf?token=1");
    expect(storage.createSignedUrl).toHaveBeenCalledWith("x.pdf", 60, {
      download: "AWLEL_Vol25_Issue1_Full_Issue.pdf",
    });
  });
});

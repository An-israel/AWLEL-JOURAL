import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        single: async () => ({ data: { allowed: true, remaining: 4, retry_after_seconds: 0 }, error: null }),
      };
    },
  }),
}));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ METRICS_SALT: "x".repeat(32) }) }));

const { blockedMessage, checkRateLimit, peekRateLimit, RATE_LIMITS } =
  await import("@/lib/server/rate-limit");

describe("sign-in and sign-up limits (item 44)", () => {
  it("leave room for a campus behind one IP but keep each account protected", () => {
    expect(RATE_LIMITS.loginFailuresPerIp.limit).toBeGreaterThanOrEqual(50);
    expect(RATE_LIMITS.loginFailuresPerAccount.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.loginFailuresPerAccount.windowSeconds).toBe(600);
    expect(RATE_LIMITS.signupPerIp.limit).toBeGreaterThanOrEqual(30);
    expect(RATE_LIMITS.signupPerEmail.limit).toBeLessThan(RATE_LIMITS.signupPerIp.limit);
  });

  it("use separate buckets for failures per IP and per account", () => {
    expect(RATE_LIMITS.loginFailuresPerIp.name).not.toBe(RATE_LIMITS.loginFailuresPerAccount.name);
  });
});

describe("peeking and counting", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("peeks without counting, and counts only when asked (failed sign-ins)", async () => {
    await peekRateLimit(RATE_LIMITS.loginFailuresPerAccount, "account:ada@example.org");
    expect(calls.map((c) => c.name)).toEqual(["peek_rate_limit"]);
    await checkRateLimit(RATE_LIMITS.loginFailuresPerAccount, "account:ada@example.org");
    expect(calls.map((c) => c.name)).toEqual(["peek_rate_limit", "check_rate_limit"]);
    // Same bucket key for both, and never the raw email.
    expect(calls[0].args.p_key).toBe(calls[1].args.p_key);
    expect(String(calls[0].args.p_key)).not.toContain("ada@example.org");
  });
});

describe("blockedMessage", () => {
  const ok = { allowed: true, remaining: 3, retryAfterSeconds: 0 };
  it("is null while every limit has room", () => {
    expect(blockedMessage([ok, ok])).toBeNull();
  });
  it("gives the longest wait in whole minutes", () => {
    expect(
      blockedMessage([
        ok,
        { allowed: false, remaining: 0, retryAfterSeconds: 61 },
        { allowed: false, remaining: 0, retryAfterSeconds: 30 },
      ]),
    ).toBe("Too many attempts. Please wait about 2 minutes and try again.");
    expect(blockedMessage([{ allowed: false, remaining: 0, retryAfterSeconds: 5 }])).toBe(
      "Too many attempts. Please wait about 1 minute and try again.",
    );
  });
});

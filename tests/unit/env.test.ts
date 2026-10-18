import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvForTests, serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/server/logger";

/*
 * Server environment (lib/env.server.ts): a typo in an optional variable must
 * not take the whole site down, while a missing required one still fails
 * clearly.
 */

const REQUIRED = {
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-0123456789",
  METRICS_SALT: "salt-0123456789abcdef",
};
const OPTIONAL = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "EDITORIAL_EMAIL",
  "ALERT_EMAIL",
  "SENTRY_DSN",
  "LOG_LEVEL",
];

const warn = vi.spyOn(logger, "warn");

beforeEach(() => {
  resetServerEnvForTests();
  warn.mockClear();
  for (const name of OPTIONAL) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(REQUIRED)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

const warnedAbout = () => warn.mock.calls.map(([fields]) => (fields as { variable?: string }).variable);

describe("serverEnv", () => {
  it("trims values and treats blank ones as not set", () => {
    vi.stubEnv("ALERT_EMAIL", "  editor@example.com\n");
    vi.stubEnv("CRON_SECRET", " cron-secret-0123456789 ");
    vi.stubEnv("SENTRY_DSN", "   ");
    const env = serverEnv();
    expect(env.ALERT_EMAIL).toBe("editor@example.com");
    expect(env.CRON_SECRET).toBe("cron-secret-0123456789");
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.EDITORIAL_EMAIL).toBe("awlel.journal@gmail.com");
    expect(env.LOG_LEVEL).toBe("info");
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores invalid optional values with one warning each, instead of failing", () => {
    vi.stubEnv("ALERT_EMAIL", "editor @example.com");
    vi.stubEnv("SENTRY_DSN", "not a url");
    vi.stubEnv("EDITORIAL_EMAIL", "journal-at-example.com");
    vi.stubEnv("LOG_LEVEL", "loud");
    const env = serverEnv();
    expect(env.ALERT_EMAIL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.EDITORIAL_EMAIL).toBe("awlel.journal@gmail.com");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(REQUIRED.SUPABASE_SERVICE_ROLE_KEY);
    expect(warnedAbout().sort()).toEqual(["ALERT_EMAIL", "EDITORIAL_EMAIL", "LOG_LEVEL", "SENTRY_DSN"]);

    // Parsed once: the warnings aren't repeated on every request.
    serverEnv();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("never logs the invalid value itself", () => {
    vi.stubEnv("CRON_SECRET", "short-secret");
    serverEnv();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("short-secret");
  });

  it("accepts EMAIL_FROM with or without a display name, and rejects a stray space", () => {
    vi.stubEnv("EMAIL_FROM", "AWLEL Journal <no-reply@awlel-journal.org>");
    expect(serverEnv().EMAIL_FROM).toBe("AWLEL Journal <no-reply@awlel-journal.org>");
    resetServerEnvForTests();
    vi.stubEnv("EMAIL_FROM", "no-reply@awlel-journal.org");
    expect(serverEnv().EMAIL_FROM).toBe("no-reply@awlel-journal.org");
    resetServerEnvForTests();
    vi.stubEnv("EMAIL_FROM", "no-reply@awlel journal.org");
    expect(serverEnv().EMAIL_FROM).toBeUndefined();
  });

  it("has no made-up default sender", () => {
    expect(serverEnv().EMAIL_FROM).toBeUndefined();
  });

  it("still fails clearly when a required value is missing or invalid", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    resetServerEnvForTests();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", REQUIRED.SUPABASE_SERVICE_ROLE_KEY);
    vi.stubEnv("METRICS_SALT", "short");
    expect(() => serverEnv()).toThrow(/METRICS_SALT/);
  });

  it("accepts the Supabase integration's names as fallbacks", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("METRICS_SALT", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_0123456789abcdef");
    vi.stubEnv("SUPABASE_JWT_SECRET", "jwt-secret-0123456789");
    const env = serverEnv();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_0123456789abcdef");
    expect(env.METRICS_SALT).toBe("jwt-secret-0123456789");
  });
});

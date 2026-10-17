import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateAlerts, type OpsSnapshot } from "@/lib/ops/alerts";
import { bearerMatches, verifySvixSignature } from "@/lib/ops/signatures";

const now = new Date("2026-10-17T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const healthy: OpsSnapshot = {
  now,
  openDeadLetters: 0,
  oldestReadyJobAt: null,
  openCircuits: [],
  lastSuccess: { queue: hoursAgo(0.2), daily: hoursAgo(5), backup: hoursAgo(24) },
  failingDependencies: [],
  errorsLastHour: 0,
  certificateDaysLeft: 60,
};
const keys = (s: Partial<OpsSnapshot>) => evaluateAlerts({ ...healthy, ...s }).map((a) => a.key);

describe("alert rules", () => {
  it("stay quiet when everything is fine", () => {
    expect(keys({})).toEqual([]);
  });

  it("fire for failing dependencies, dead letters and open circuits", () => {
    expect(keys({ failingDependencies: ["database"] })).toEqual(["dependencies"]);
    expect(keys({ openDeadLetters: 2 })).toEqual(["dead-letters"]);
    expect(keys({ openCircuits: ["resend"] })).toEqual(["circuit-open"]);
  });

  it("fire for an error spike and a certificate close to expiry", () => {
    expect(keys({ errorsLastHour: 24 })).toEqual([]);
    expect(keys({ errorsLastHour: 25 })).toEqual(["error-rate"]);
    expect(keys({ certificateDaysLeft: 13 })).toEqual(["certificate"]);
    expect(keys({ certificateDaysLeft: null })).toEqual([]);
  });

  it("fire when jobs wait over an hour", () => {
    expect(keys({ oldestReadyJobAt: hoursAgo(0.5) })).toEqual([]);
    expect(keys({ oldestReadyJobAt: hoursAgo(2) })).toEqual(["queue-backlog"]);
  });

  it("fire for stale schedules, but not for ones that never ran", () => {
    expect(keys({ lastSuccess: { ...healthy.lastSuccess, daily: hoursAgo(30) } })).toEqual(["daily-stale"]);
    expect(keys({ lastSuccess: { ...healthy.lastSuccess, queue: hoursAgo(30) } })).toEqual(["queue-stale"]);
    expect(keys({ lastSuccess: { ...healthy.lastSuccess, queue: null, daily: null } })).toEqual([]);
  });

  it("fire when no backup has succeeded for a week, including never", () => {
    expect(keys({ lastSuccess: { ...healthy.lastSuccess, backup: hoursAgo(9 * 24) } })).toEqual([
      "backup-stale",
    ]);
    const never = evaluateAlerts({ ...healthy, lastSuccess: { ...healthy.lastSuccess, backup: null } });
    expect(never[0].title).toBe("No backup has been recorded yet");
  });
});

describe("machine authentication", () => {
  it("checks the cron bearer secret exactly", () => {
    const secret = "a-very-long-cron-secret-value";
    expect(bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
    expect(bearerMatches(`Bearer ${secret}x`, secret)).toBe(false);
    expect(bearerMatches(secret, secret)).toBe(false);
    expect(bearerMatches(null, secret)).toBe(false);
    expect(bearerMatches("Bearer ", undefined)).toBe(false);
  });

  const secretBytes = Buffer.from("test-webhook-secret-bytes");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["x@y.z"] } });
  const ts = 1_800_000_000;
  const sign = (id: string, t: number, b: string) =>
    createHmac("sha256", secretBytes).update(`${id}.${t}.${b}`).digest("base64");

  it("accepts a correctly signed Resend webhook", () => {
    const signature = `v1,${sign("msg_1", ts, body)}`;
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature }, body, ts)).toBe(
      true,
    );
    // Several signatures (key rotation): any valid one is enough.
    expect(
      verifySvixSignature(
        secret,
        { id: "msg_1", timestamp: String(ts), signature: `v1,bad ${signature}` },
        body,
        ts,
      ),
    ).toBe(true);
  });

  it("rejects tampering, replays and missing headers", () => {
    const signature = `v1,${sign("msg_1", ts, body)}`;
    expect(
      verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature }, body + " ", ts),
    ).toBe(false);
    expect(verifySvixSignature(secret, { id: "msg_2", timestamp: String(ts), signature }, body, ts)).toBe(
      false,
    );
    expect(
      verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature }, body, ts + 600),
    ).toBe(false);
    expect(verifySvixSignature(secret, { id: null, timestamp: String(ts), signature }, body, ts)).toBe(false);
  });
});

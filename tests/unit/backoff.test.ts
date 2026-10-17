import { describe, expect, it } from "vitest";
import { backoffDelayMs } from "@/lib/backoff";

describe("backoffDelayMs", () => {
  it("doubles the ceiling each attempt", () => {
    const max = () => 1;
    expect(backoffDelayMs(0, { random: max })).toBe(30_000);
    expect(backoffDelayMs(1, { random: max })).toBe(60_000);
    expect(backoffDelayMs(3, { random: max })).toBe(240_000);
  });

  it("never exceeds the cap", () => {
    expect(backoffDelayMs(30, { random: () => 1 })).toBe(3_600_000);
  });

  it("applies full jitter between zero and the ceiling", () => {
    expect(backoffDelayMs(2, { random: () => 0 })).toBe(0);
    expect(backoffDelayMs(2, { random: () => 0.5 })).toBe(60_000);
  });
});

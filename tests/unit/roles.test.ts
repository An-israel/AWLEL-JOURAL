import { describe, expect, it } from "vitest";
import { landingPathFor, safeNextPath } from "@/lib/roles";

describe("safeNextPath", () => {
  it("accepts same-site paths", () => {
    expect(safeNextPath("/admin/users?page=2")).toBe("/admin/users?page=2");
  });
  it("rejects external and protocol-relative destinations", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/ok\r\nSet-Cookie: x")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe("landingPathFor", () => {
  it("sends each role to its home", () => {
    expect(landingPathFor("super_admin")).toBe("/admin");
    expect(landingPathFor("editor")).toBe("/admin");
    expect(landingPathFor("reviewer")).toBe("/admin/reviews");
    expect(landingPathFor("author")).toBe("/account");
  });
});

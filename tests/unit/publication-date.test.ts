import { describe, expect, it } from "vitest";
import {
  articlePublicationDate,
  formatPublicationDate,
  scholarPublicationDate,
} from "@/lib/publication-date";

describe("articlePublicationDate", () => {
  it("keeps the article's own date when it falls in the issue's month", () => {
    const d = articlePublicationDate("2026-06-30T08:00:00Z", { year: 2026, month: 6 });
    expect(d).toEqual({ iso: "2026-06-30", precision: "day", year: 2026, month: 6 });
    expect(formatPublicationDate(d)).toBe("30 June 2026");
    expect(scholarPublicationDate(d)).toBe("2026/06/30");
  });

  it("uses the issue's year and month for a back-catalogue article uploaded later", () => {
    const d = articlePublicationDate("2026-10-18T10:00:00Z", { year: 2005, month: 6 });
    expect(d).toEqual({ iso: "2005-06", precision: "month", year: 2005, month: 6 });
    expect(formatPublicationDate(d)).toBe("June 2005");
    expect(scholarPublicationDate(d)).toBe("2005");
  });

  it("uses the issue's year when the issue has no month", () => {
    const d = articlePublicationDate("2026-10-18T10:00:00Z", { year: 2005, month: null });
    expect(d).toEqual({ iso: "2005", precision: "year", year: 2005, month: null });
    expect(formatPublicationDate(d)).toBe("2005");
    expect(scholarPublicationDate(d)).toBe("2005");
  });

  it("keeps the article's date within the issue's year when the issue has no month", () => {
    const d = articlePublicationDate("2005-11-02T10:00:00Z", { year: 2005, month: null });
    expect(d.iso).toBe("2005-11-02");
  });

  it("treats a later month of the same year as late", () => {
    expect(articlePublicationDate("2026-07-01T00:00:00Z", { year: 2026, month: 6 }).iso).toBe("2026-06");
  });

  it("keeps an article published ahead of its issue", () => {
    expect(articlePublicationDate("2026-05-20T12:00:00Z", { year: 2026, month: 6 }).iso).toBe("2026-05-20");
  });

  it("falls back to the issue when there is no usable timestamp", () => {
    expect(articlePublicationDate(null, { year: 2019, month: 12 }).iso).toBe("2019-12");
    expect(articlePublicationDate("not a date", { year: 2019, month: null }).iso).toBe("2019");
  });
});

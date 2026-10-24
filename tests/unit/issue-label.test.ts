import { describe, expect, it } from "vitest";
import { issueFileStem, issueLabel, issuePath, legacyLabel } from "@/lib/issue-label";

describe("issueLabel", () => {
  it("includes the issue number even when the volume has a single issue", () => {
    expect(issueLabel({ volumeNumber: 23, year: 2023, issueNumber: 1, issuesInVolume: 1 })).toBe(
      "Volume 23, Issue 1 (2023)",
    );
  });

  it("includes the issue number when the volume has several issues", () => {
    expect(issueLabel({ volumeNumber: 25, year: 2025, issueNumber: 1, issuesInVolume: 2 })).toBe(
      "Volume 25, Issue 1 (2025)",
    );
  });

  it("shows the month when set", () => {
    expect(issueLabel({ volumeNumber: 25, year: 2025, issueNumber: 1, month: 6, issuesInVolume: 2 })).toBe(
      "Volume 25, Issue 1 (June 2025)",
    );
    expect(issueLabel({ volumeNumber: 19, year: 2019, issueNumber: 1, month: 11, issuesInVolume: 1 })).toBe(
      "Volume 19, Issue 1 (November 2019)",
    );
  });

  it("ignores an out-of-range month", () => {
    expect(issueLabel({ volumeNumber: 21, year: 2021, issueNumber: 1, month: 13, issuesInVolume: 1 })).toBe(
      "Volume 21, Issue 1 (2021)",
    );
  });
});

describe("legacyLabel", () => {
  it("formats a running number", () => {
    expect(legacyLabel(19)).toBe("No. 19");
  });
  it("returns null when absent", () => {
    expect(legacyLabel(null)).toBeNull();
    expect(legacyLabel(undefined)).toBeNull();
  });
});

describe("issueFileStem / issuePath", () => {
  it("builds file stems", () => {
    expect(issueFileStem({ volumeNumber: 25, issueNumber: 1 })).toBe("Vol25_Issue1");
    expect(issueFileStem({ volumeNumber: 23, issueNumber: 2 })).toBe("Vol23_Issue2");
  });
  it("builds the issue route", () => {
    expect(issuePath(25, 2)).toBe("/issues/25/2");
  });
});

import { describe, it, expect } from "vitest";
import {
  buildResetSummary,
  totalRecordsToDelete,
  isResetConfirmed,
  RESET_LABELS,
  RESET_CONFIRM_PHRASE,
  type ResetCounts,
} from "../resetUtils";

function zeroCounts(): ResetCounts {
  return {
    divisions: 0,
    projects: 0,
    users: 0,
    allocations: 0,
    allocationBatches: 0,
    leaves: 0,
    leaveApprovals: 0,
    hoursLogs: 0,
    timesheets: 0,
    tasks: 0,
    resourceRequests: 0,
    userSkills: 0,
    notifications: 0,
    auditLogs: 0,
    pipeline: 0,
  };
}

describe("buildResetSummary", () => {
  it("returns one row per tracked table with matching label and count", () => {
    const counts = { ...zeroCounts(), divisions: 2, projects: 5, users: 11 };
    const rows = buildResetSummary(counts);

    expect(rows).toHaveLength(Object.keys(RESET_LABELS).length);

    const divisionsRow = rows.find((r) => r.key === "divisions");
    expect(divisionsRow).toEqual({ key: "divisions", label: RESET_LABELS.divisions, count: 2 });

    const usersRow = rows.find((r) => r.key === "users");
    expect(usersRow?.count).toBe(11);
    expect(usersRow?.label).toMatch(/everyone except your account/i);
  });

  it("handles an all-zero counts object (already-empty database)", () => {
    const rows = buildResetSummary(zeroCounts());
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(rows).toHaveLength(15);
  });
});

describe("totalRecordsToDelete", () => {
  it("sums every count across all tables", () => {
    const counts = { ...zeroCounts(), divisions: 2, projects: 3, allocations: 100 };
    expect(totalRecordsToDelete(counts)).toBe(105);
  });

  it("returns 0 when every table is empty", () => {
    expect(totalRecordsToDelete(zeroCounts())).toBe(0);
  });

  it("returns the sum of a single non-zero field", () => {
    const counts = { ...zeroCounts(), pipeline: 7 };
    expect(totalRecordsToDelete(counts)).toBe(7);
  });
});

describe("isResetConfirmed", () => {
  it("returns true for the exact confirmation phrase", () => {
    expect(isResetConfirmed(RESET_CONFIRM_PHRASE)).toBe(true);
    expect(isResetConfirmed("DELETE ALL DATA")).toBe(true);
  });

  it("trims surrounding whitespace before comparing", () => {
    expect(isResetConfirmed("  DELETE ALL DATA  ")).toBe(true);
    expect(isResetConfirmed("\nDELETE ALL DATA\n")).toBe(true);
  });

  it("rejects wrong case", () => {
    expect(isResetConfirmed("delete all data")).toBe(false);
    expect(isResetConfirmed("Delete All Data")).toBe(false);
  });

  it("rejects partial or extra text", () => {
    expect(isResetConfirmed("DELETE ALL")).toBe(false);
    expect(isResetConfirmed("DELETE ALL DATA NOW")).toBe(false);
    expect(isResetConfirmed("DELETE  ALL DATA")).toBe(false); // double space
  });

  it("rejects null, undefined and empty string", () => {
    expect(isResetConfirmed(null)).toBe(false);
    expect(isResetConfirmed(undefined)).toBe(false);
    expect(isResetConfirmed("")).toBe(false);
  });
});

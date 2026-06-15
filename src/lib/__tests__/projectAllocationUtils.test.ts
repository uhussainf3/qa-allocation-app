import { describe, it, expect } from "vitest";
import {
  computeAllocationPct,
  categorizeAllocation,
  groupAllocationsByCategory,
  type ProjectAllocationRow,
} from "../projectAllocationUtils";

const TODAY = "2026-06-15"; // matches the "current date" used throughout this project's session

function row(over: Partial<ProjectAllocationRow> = {}): ProjectAllocationRow {
  return {
    id: "a1",
    userId: "u1",
    userName: "Jane Doe",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2026-06-30T00:00:00.000Z",
    allocationPct: 100,
    hoursToDate: 40,
    totalHours: 160,
    ...over,
  };
}

// ─── computeAllocationPct ───────────────────────────────────────────────────

describe("computeAllocationPct", () => {
  it("computes 100% when hoursPerDay equals the daily capacity", () => {
    // capacity 40/wk -> 8/day; hoursPerDay 8 -> 100%
    expect(computeAllocationPct(8, 40)).toBe(100);
  });

  it("computes 50% for half-day allocation", () => {
    expect(computeAllocationPct(4, 40)).toBe(50);
  });

  it("returns 0 when hoursPerDay is 0", () => {
    expect(computeAllocationPct(0, 40)).toBe(0);
  });

  it("returns 0 when capacity is 0 (avoids divide-by-zero)", () => {
    expect(computeAllocationPct(8, 0)).toBe(0);
  });

  it("returns 0 when capacity is negative", () => {
    expect(computeAllocationPct(8, -10)).toBe(0);
  });

  it("can exceed 100% for over-allocation", () => {
    expect(computeAllocationPct(10, 40)).toBe(125);
  });

  it("rounds to the nearest whole percent", () => {
    // dailyCap = 30/5 = 6; 5/6 = 83.33% -> rounds to 83
    expect(computeAllocationPct(5, 30)).toBe(83);
  });
});

// ─── categorizeAllocation ───────────────────────────────────────────────────

describe("categorizeAllocation", () => {
  it("returns 'active' when today falls within the date range", () => {
    expect(categorizeAllocation("2026-06-01", "2026-06-30", TODAY)).toBe("active");
  });

  it("returns 'active' when the allocation starts today", () => {
    expect(categorizeAllocation(TODAY, "2026-06-30", TODAY)).toBe("active");
  });

  it("returns 'active' when the allocation ends today", () => {
    expect(categorizeAllocation("2026-06-01", TODAY, TODAY)).toBe("active");
  });

  it("returns 'active' when start and end are both today", () => {
    expect(categorizeAllocation(TODAY, TODAY, TODAY)).toBe("active");
  });

  it("returns 'upcoming' when the start date is after today", () => {
    expect(categorizeAllocation("2026-06-16", "2026-06-30", TODAY)).toBe("upcoming");
  });

  it("returns 'ended' when the end date is before today", () => {
    expect(categorizeAllocation("2026-06-01", "2026-06-14", TODAY)).toBe("ended");
  });

  it("accepts full ISO timestamps and compares only the date portion", () => {
    expect(categorizeAllocation("2026-06-01T00:00:00.000Z", "2026-06-15T23:59:59.999Z", TODAY)).toBe("active");
  });

  it("accepts a Date object for `today`", () => {
    const today = new Date(`${TODAY}T12:00:00.000Z`);
    expect(categorizeAllocation("2026-06-01", "2026-06-30", today)).toBe("active");
  });
});

// ─── groupAllocationsByCategory ─────────────────────────────────────────────

describe("groupAllocationsByCategory", () => {
  it("returns empty buckets for an empty input", () => {
    expect(groupAllocationsByCategory([], TODAY)).toEqual({ active: [], upcoming: [], ended: [] });
  });

  it("splits rows into active, upcoming, and ended buckets", () => {
    const rows = [
      row({ id: "active-1",   startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-30T00:00:00.000Z" }),
      row({ id: "upcoming-1", startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-07-31T00:00:00.000Z" }),
      row({ id: "ended-1",    startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-31T00:00:00.000Z" }),
    ];
    const result = groupAllocationsByCategory(rows, TODAY);
    expect(result.active.map((r) => r.id)).toEqual(["active-1"]);
    expect(result.upcoming.map((r) => r.id)).toEqual(["upcoming-1"]);
    expect(result.ended.map((r) => r.id)).toEqual(["ended-1"]);
  });

  it("sorts active and upcoming rows by start date ascending", () => {
    const rows = [
      row({ id: "later",   startDate: "2026-06-10T00:00:00.000Z", endDate: "2026-06-30T00:00:00.000Z" }),
      row({ id: "earlier", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-30T00:00:00.000Z" }),
    ];
    const result = groupAllocationsByCategory(rows, TODAY);
    expect(result.active.map((r) => r.id)).toEqual(["earlier", "later"]);
  });

  it("sorts ended rows by end date descending (most recently ended first)", () => {
    const rows = [
      row({ id: "oldest",     startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" }),
      row({ id: "mostRecent", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-10T00:00:00.000Z" }),
    ];
    const result = groupAllocationsByCategory(rows, TODAY);
    expect(result.ended.map((r) => r.id)).toEqual(["mostRecent", "oldest"]);
  });

  it("handles a project with no allocations in some categories", () => {
    const rows = [
      row({ id: "active-only", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-30T00:00:00.000Z" }),
    ];
    const result = groupAllocationsByCategory(rows, TODAY);
    expect(result.active).toHaveLength(1);
    expect(result.upcoming).toEqual([]);
    expect(result.ended).toEqual([]);
  });
});

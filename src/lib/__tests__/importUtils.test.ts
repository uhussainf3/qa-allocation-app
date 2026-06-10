import { describe, it, expect } from "vitest";
import {
  parseRMDate,
  computeCsvRange,
  buildCsvPairKey,
  detectIntraCSVOverlaps,
  detectDuplicateRows,
  buildPercentChangeNote,
  buildOverlapNote,
} from "../importUtils";

// UTC date helper — all import dates are UTC midnight
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRMDate
// ─────────────────────────────────────────────────────────────────────────────
describe("parseRMDate", () => {
  it("parses 2-digit year (d-Mon-YY)", () => {
    expect(parseRMDate("2-Jun-26")).toEqual(utc(2026, 6, 2));
  });

  it("parses 4-digit year (d-Mon-YYYY)", () => {
    expect(parseRMDate("30-Apr-2025")).toEqual(utc(2025, 4, 30));
  });

  it("pads single-digit day to produce a valid date", () => {
    expect(parseRMDate("1-Jan-25")).toEqual(utc(2025, 1, 1));
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseRMDate("  5-Mar-26  ")).toEqual(utc(2026, 3, 5));
  });

  it("returns null for empty string", () => {
    expect(parseRMDate("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseRMDate("   ")).toBeNull();
  });

  it("returns null for unrecognised month abbreviation", () => {
    expect(parseRMDate("2-Xyz-26")).toBeNull();
  });

  it("returns null when segment count is not 3 (S-8 / S-12 bad row data)", () => {
    expect(parseRMDate("2026-06-02")).toBeNull(); // ISO format — month "06" not in map
    expect(parseRMDate("Jun-26")).toBeNull();     // 2 parts
    expect(parseRMDate("2-Jun")).toBeNull();      // 2 parts
  });

  it("returns null for non-numeric year", () => {
    expect(parseRMDate("2-Jun-XX")).toBeNull();
  });

  it("parses all 12 month abbreviations", () => {
    const months = [
      ["Jan", 1], ["Feb", 2], ["Mar", 3], ["Apr", 4],
      ["May", 5], ["Jun", 6], ["Jul", 7], ["Aug", 8],
      ["Sep", 9], ["Oct", 10], ["Nov", 11], ["Dec", 12],
    ] as const;
    for (const [mon, m] of months) {
      expect(parseRMDate(`1-${mon}-25`)).toEqual(utc(2025, m, 1));
    }
  });

  it("parses month abbreviations case-insensitively", () => {
    expect(parseRMDate("1-JUN-26")).toEqual(utc(2026, 6, 1));
    expect(parseRMDate("1-jun-26")).toEqual(utc(2026, 6, 1));
    expect(parseRMDate("1-Jun-26")).toEqual(utc(2026, 6, 1));
  });

  it("parses end-of-month 31-Dec-25", () => {
    expect(parseRMDate("31-Dec-25")).toEqual(utc(2025, 12, 31));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCsvRange
// ─────────────────────────────────────────────────────────────────────────────
describe("computeCsvRange", () => {
  it("returns null for empty array", () => {
    expect(computeCsvRange([])).toBeNull();
  });

  // S-13: single-row CSV — algorithm must still compute a valid range
  it("S-13: single row → range equals that row's dates", () => {
    const start = utc(2026, 1, 5);
    const end   = utc(2026, 1, 26);
    expect(computeCsvRange([{ start, end }])).toEqual({ minStart: start, maxEnd: end });
  });

  // S-4 / S-5: multi-row CSV — range must span all rows
  it("S-4/S-5: picks the earliest start across rows", () => {
    const rows = [
      { start: utc(2026, 3, 2), end: utc(2026, 3, 30) },
      { start: utc(2026, 1, 5), end: utc(2026, 2, 28) },
      { start: utc(2026, 2, 9), end: utc(2026, 3, 2)  },
    ];
    expect(computeCsvRange(rows)?.minStart).toEqual(utc(2026, 1, 5));
  });

  it("S-4/S-5: picks the latest end across rows", () => {
    const rows = [
      { start: utc(2026, 1, 5), end: utc(2026, 2, 28) },
      { start: utc(2026, 2, 9), end: utc(2026, 4, 26) },
      { start: utc(2026, 3, 2), end: utc(2026, 3, 30) },
    ];
    expect(computeCsvRange(rows)?.maxEnd).toEqual(utc(2026, 4, 26));
  });

  it("two rows, same start and end → range is that same window", () => {
    const start = utc(2026, 6, 1);
    const end   = utc(2026, 6, 30);
    expect(computeCsvRange([{ start, end }, { start, end }])).toEqual({
      minStart: start,
      maxEnd:   end,
    });
  });

  it("overall start and end are correct simultaneously for a 3-row CSV", () => {
    const rows = [
      { start: utc(2026, 3, 1),  end: utc(2026, 5, 31) },
      { start: utc(2026, 1, 1),  end: utc(2026, 3, 31) },
      { start: utc(2026, 4, 1),  end: utc(2026, 12, 31) },
    ];
    expect(computeCsvRange(rows)).toEqual({
      minStart: utc(2026, 1, 1),
      maxEnd:   utc(2026, 12, 31),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCsvPairKey
// ─────────────────────────────────────────────────────────────────────────────
describe("buildCsvPairKey", () => {
  it("formats as userId::projectId", () => {
    expect(buildCsvPairKey("user-1", "proj-1")).toBe("user-1::proj-1");
  });

  // S-11: pairs are keyed by both userId AND projectId, so different users → different keys
  it("S-11: different userId produces a different key for the same project", () => {
    const a = buildCsvPairKey("user-1", "proj-1");
    const b = buildCsvPairKey("user-2", "proj-1");
    expect(a).not.toBe(b);
  });

  it("different projectId produces a different key for the same user", () => {
    const a = buildCsvPairKey("user-1", "proj-1");
    const b = buildCsvPairKey("user-1", "proj-2");
    expect(a).not.toBe(b);
  });

  it("same inputs always produce the same key (deterministic)", () => {
    expect(buildCsvPairKey("abc", "xyz")).toBe(buildCsvPairKey("abc", "xyz"));
  });

  it("uses '::' as separator so ids that contain ':' don't collide", () => {
    // "a:b" + ":c" should not equal "a" + ":b:c" after splitting by "::"
    const k1 = buildCsvPairKey("a:b", "c");
    const k2 = buildCsvPairKey("a", "b:c");
    expect(k1).not.toBe(k2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectIntraCSVOverlaps  (S-6)
// ─────────────────────────────────────────────────────────────────────────────
describe("detectIntraCSVOverlaps", () => {
  it("returns empty array when rows is empty", () => {
    expect(detectIntraCSVOverlaps([])).toEqual([]);
  });

  // S-1: single row for a pair → no overlap possible
  it("S-1: single row → no conflict", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5), end: utc(2026, 1, 26) },
    ];
    expect(detectIntraCSVOverlaps(rows)).toEqual([]);
  });

  // S-6 core: two rows, same pair, ranges overlap in the middle
  it("S-6: two rows for same pair with overlapping ranges → one conflict", () => {
    const rows = [
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 5),  end: utc(2026, 2, 2) },
      { rowIndex: 5, userId: "u1", projectId: "p1", start: utc(2026, 1, 26), end: utc(2026, 3, 2) },
    ];
    const conflicts = detectIntraCSVOverlaps(rows);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ rowA: 2, rowB: 5, userId: "u1", projectId: "p1" });
  });

  // S-6: touching boundary (end of A === start of B) counts as overlap per a.start <= b.end
  it("S-6: touching ranges (end of A = start of B) → counted as overlap", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5), end: utc(2026, 2, 2) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 2, 2), end: utc(2026, 3, 2) },
    ];
    expect(detectIntraCSVOverlaps(rows)).toHaveLength(1);
  });

  it("non-overlapping ranges for same pair with a clear gap → no conflict", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5),  end: utc(2026, 1, 26) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 2, 2),  end: utc(2026, 3, 2)  },
    ];
    expect(detectIntraCSVOverlaps(rows)).toEqual([]);
  });

  // S-11: different userId, identical dates/project → not a conflict
  it("S-11: same project + same dates but different userId → no conflict", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5), end: utc(2026, 2, 2) },
      { rowIndex: 2, userId: "u2", projectId: "p1", start: utc(2026, 1, 5), end: utc(2026, 2, 2) },
    ];
    expect(detectIntraCSVOverlaps(rows)).toEqual([]);
  });

  it("same user + same dates but different projectId → no conflict", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5), end: utc(2026, 2, 2) },
      { rowIndex: 2, userId: "u1", projectId: "p2", start: utc(2026, 1, 5), end: utc(2026, 2, 2) },
    ];
    expect(detectIntraCSVOverlaps(rows)).toEqual([]);
  });

  // S-6: one wide row overlaps two narrower ones → produces two conflict entries
  it("S-6: one row overlapping two others → two conflict entries", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 1),  end: utc(2026, 6, 30) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 2, 1),  end: utc(2026, 3, 1)  },
      { rowIndex: 3, userId: "u1", projectId: "p1", start: utc(2026, 4, 1),  end: utc(2026, 5, 1)  },
    ];
    const conflicts = detectIntraCSVOverlaps(rows);
    expect(conflicts).toHaveLength(2);
    const rowAs = conflicts.map((c) => c.rowA);
    const rowBs = conflicts.map((c) => c.rowB);
    expect(rowAs).toEqual([1, 1]);
    expect(rowBs).toContain(2);
    expect(rowBs).toContain(3);
  });

  // Mixed: some pairs overlap, others don't — only the overlapping pair is flagged
  it("mixed CSV: only the overlapping pair is flagged", () => {
    const rows = [
      // pair (u1, p1): overlap
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 1), end: utc(2026, 3, 31) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 3, 1), end: utc(2026, 5, 31) },
      // pair (u2, p2): no overlap
      { rowIndex: 3, userId: "u2", projectId: "p2", start: utc(2026, 1, 1), end: utc(2026, 1, 31) },
      { rowIndex: 4, userId: "u2", projectId: "p2", start: utc(2026, 2, 1), end: utc(2026, 2, 28) },
    ];
    const conflicts = detectIntraCSVOverlaps(rows);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ rowA: 1, rowB: 2, userId: "u1", projectId: "p1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectDuplicateRows  (S-7)
// ─────────────────────────────────────────────────────────────────────────────
describe("detectDuplicateRows", () => {
  it("returns empty array for an empty input", () => {
    expect(detectDuplicateRows([])).toEqual([]);
  });

  // S-7: rows with distinct (userId, projectId, startDate) triples → no duplicates
  it("S-7: all unique triples → no duplicates", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 2, 2) }, // same pair, different start
      { rowIndex: 3, userId: "u2", projectId: "p1", start: utc(2026, 1, 5) }, // same start, different user
    ];
    expect(detectDuplicateRows(rows)).toEqual([]);
  });

  // S-7: two rows with identical triple → second is the duplicate
  it("S-7: exact same (userId, projectId, startDate) triple → duplicate flagged", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
    ];
    const dupes = detectDuplicateRows(rows);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toMatchObject({ originalRow: 1, duplicateRow: 2 });
  });

  // S-7: three rows same triple → two duplicates, both point to row 1 as original
  it("S-7: three rows with same triple → two duplicates, all point to row 1", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 3, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
    ];
    const dupes = detectDuplicateRows(rows);
    expect(dupes).toHaveLength(2);
    expect(dupes[0]).toMatchObject({ originalRow: 1, duplicateRow: 2 });
    expect(dupes[1]).toMatchObject({ originalRow: 1, duplicateRow: 3 });
  });

  it("different startDate for same pair is NOT a duplicate", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 6) },
    ];
    expect(detectDuplicateRows(rows)).toEqual([]);
  });

  it("different userId for same project and startDate is NOT a duplicate", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u2", projectId: "p1", start: utc(2026, 1, 5) },
    ];
    expect(detectDuplicateRows(rows)).toEqual([]);
  });

  it("different projectId for same user and startDate is NOT a duplicate", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p2", start: utc(2026, 1, 5) },
    ];
    expect(detectDuplicateRows(rows)).toEqual([]);
  });

  it("key field contains userId, projectId, and ISO date", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
    ];
    const dupes = detectDuplicateRows(rows);
    expect(dupes[0].key).toContain("u1");
    expect(dupes[0].key).toContain("p1");
    expect(dupes[0].key).toContain("2026-01-05");
  });

  // S-8 / S-12: rows from different pairs are tracked independently
  it("duplicate in one pair does not affect another pair", () => {
    const rows = [
      { rowIndex: 1, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) },
      { rowIndex: 2, userId: "u1", projectId: "p1", start: utc(2026, 1, 5) }, // duplicate of row 1
      { rowIndex: 3, userId: "u2", projectId: "p2", start: utc(2026, 1, 5) }, // different pair
      { rowIndex: 4, userId: "u2", projectId: "p2", start: utc(2026, 2, 2) }, // different start, not a dup
    ];
    const dupes = detectDuplicateRows(rows);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toMatchObject({ originalRow: 1, duplicateRow: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPercentChangeNote  (S-3 / S-9)
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPercentChangeNote", () => {
  // S-9 / S-3: standard percent change
  it("S-9: formats 50%→100% with the import date", () => {
    const note = buildPercentChangeNote(4, 8, new Date("2026-06-06T00:00:00Z"));
    expect(note).toMatch(/% changed: 50→100/);
    expect(note).toContain("(import:");
  });

  it("S-3: identical hours → shows same % on both sides", () => {
    const note = buildPercentChangeNote(8, 8, new Date("2026-06-06T00:00:00Z"));
    expect(note).toMatch(/% changed: 100→100/);
  });

  it("decrease in hours → old % is larger than new %", () => {
    const note = buildPercentChangeNote(8, 4, new Date("2026-01-01T00:00:00Z"));
    expect(note).toMatch(/% changed: 100→50/);
  });

  it("rounds fractional percentages to nearest integer", () => {
    // 3/8 * 100 = 37.5 → 38;  6/8 * 100 = 75
    const note = buildPercentChangeNote(3, 6, new Date("2026-01-01T00:00:00Z"));
    expect(note).toMatch(/% changed: 38→75/);
  });

  it("zero old hours → 0% shown", () => {
    const note = buildPercentChangeNote(0, 4, new Date("2026-01-01T00:00:00Z"));
    expect(note).toMatch(/% changed: 0→50/);
  });

  it("note includes '(import:' wrapper around the date", () => {
    const note = buildPercentChangeNote(4, 8, new Date("2026-06-06T00:00:00Z"));
    expect(note).toMatch(/\(import:.*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildOverlapNote  (S-6)
// ─────────────────────────────────────────────────────────────────────────────
describe("buildOverlapNote", () => {
  // S-6: overlap note must reference the conflicting row number
  it("S-6: includes the conflicting row number", () => {
    expect(buildOverlapNote(5)).toContain("row 5");
    expect(buildOverlapNote(12)).toContain("row 12");
  });

  it("S-6: contains the word 'Overlap' (or 'overlap')", () => {
    expect(buildOverlapNote(3)).toMatch(/[Oo]verlap/);
  });

  it("different row numbers produce different notes", () => {
    expect(buildOverlapNote(1)).not.toBe(buildOverlapNote(2));
  });

  it("note is a non-empty string", () => {
    const note = buildOverlapNote(7);
    expect(typeof note).toBe("string");
    expect(note.length).toBeGreaterThan(0);
  });
});

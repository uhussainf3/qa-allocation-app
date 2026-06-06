// src/lib/importUtils.ts
// Pure utility functions for the RM Tool allocation import algorithm.
// All functions here are side-effect-free and fully unit-testable.

// ── parseRMDate ───────────────────────────────────────────────────────────────
// Parse "d-Mon-YY" or "d-Mon-YYYY" → UTC midnight Date
// Examples: "2-Jun-26" → 2026-06-02T00:00:00Z
//           "30-Apr-2025" → 2025-04-30T00:00:00Z
//           "bad-data"   → null
export function parseRMDate(raw: string): Date | null {
  if (!raw || raw.trim() === "") return null;

  const parts = raw.trim().split("-");
  if (parts.length !== 3) return null;

  const [dayStr, monStr, yrStr] = parts;
  if (!dayStr || !monStr || !yrStr) return null;

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const month = months[monStr.toLowerCase()];
  if (!month) return null;

  const yearNum = parseInt(yrStr, 10);
  if (isNaN(yearNum)) return null;

  const year = yearNum < 100 ? 2000 + yearNum : yearNum;
  const day  = dayStr.padStart(2, "0");

  const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

// ── computeCsvRange ───────────────────────────────────────────────────────────
// Given validated rows (already have parsed dates), compute the date range
// spanned by the entire CSV. Only rows with valid dates contribute.
// Returns null if the input array is empty.
export function computeCsvRange(
  rows: Array<{ start: Date; end: Date }>
): { minStart: Date; maxEnd: Date } | null {
  if (rows.length === 0) return null;

  let minStart = rows[0].start;
  let maxEnd   = rows[0].end;

  for (const row of rows) {
    if (row.start < minStart) minStart = row.start;
    if (row.end   > maxEnd)   maxEnd   = row.end;
  }

  return { minStart, maxEnd };
}

// ── buildCsvPairKey ───────────────────────────────────────────────────────────
// Build a unique string key for a (userId, projectId) pair.
// Used to build the csvPairs Set for scoped delete.
export function buildCsvPairKey(userId: string, projectId: string): string {
  return `${userId}::${projectId}`;
}

// ── detectIntraCSVOverlaps ────────────────────────────────────────────────────
// S-6: Find pairs of rows in the same CSV where the same (userId, projectId)
// has overlapping date ranges.
//
// Two ranges [a.start, a.end] and [b.start, b.end] overlap when:
//   a.start <= b.end  AND  b.start <= a.end
//
// Returns all conflicting pairs. A row may appear in multiple conflicts.
// Overlapping rows are still IMPORTED — they are flagged with a note, not rejected.

export type OverlapConflict = {
  rowA:      number;   // 1-based original CSV row index
  rowB:      number;
  userId:    string;   // internal DB id
  projectId: string;   // internal DB id
};

export function detectIntraCSVOverlaps(
  rows: Array<{
    rowIndex:  number;
    userId:    string;
    projectId: string;
    start:     Date;
    end:       Date;
  }>
): OverlapConflict[] {
  const conflicts: OverlapConflict[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];

      // Only check same employee+project pair
      if (a.userId !== b.userId || a.projectId !== b.projectId) continue;

      // Overlap check
      if (a.start <= b.end && b.start <= a.end) {
        conflicts.push({
          rowA:      a.rowIndex,
          rowB:      b.rowIndex,
          userId:    a.userId,
          projectId: a.projectId,
        });
      }
    }
  }

  return conflicts;
}

// ── detectDuplicateRows ───────────────────────────────────────────────────────
// S-7: Find rows that share the same (userId, projectId, startDate) triple.
// The FIRST occurrence is kept; all subsequent ones are marked as duplicates.
// Duplicates are skipped during insert (unique constraint would reject them anyway).

export type DuplicateRow = {
  originalRow:  number;   // 1-based row index of the first (kept) occurrence
  duplicateRow: number;   // 1-based row index of this duplicate
  key:          string;   // the triple that collided
};

export function detectDuplicateRows(
  rows: Array<{
    rowIndex:  number;
    userId:    string;
    projectId: string;
    start:     Date;
  }>
): DuplicateRow[] {
  const seen  = new Map<string, number>(); // key → first rowIndex
  const dupes: DuplicateRow[] = [];

  for (const row of rows) {
    const key = `${row.userId}::${row.projectId}::${row.start.toISOString()}`;

    if (seen.has(key)) {
      dupes.push({
        originalRow:  seen.get(key)!,
        duplicateRow: row.rowIndex,
        key,
      });
    } else {
      seen.set(key, row.rowIndex);
    }
  }

  return dupes;
}

// ── buildPercentChangeNote ────────────────────────────────────────────────────
// S-9: Build a human-readable note when the allocation % changed between imports.
// Attached to the newly inserted allocation row's `notes` field.
export function buildPercentChangeNote(
  oldHoursPerDay: number,
  newHoursPerDay: number,
  importDate:     Date
): string {
  const oldPct  = Math.round((oldHoursPerDay / 8) * 100);
  const newPct  = Math.round((newHoursPerDay  / 8) * 100);
  const dateStr = importDate.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
  return `% changed: ${oldPct}→${newPct} (import: ${dateStr})`;
}

// ── buildOverlapNote ──────────────────────────────────────────────────────────
// S-6: Build a note for allocations flagged as overlapping with another row
// in the same import. Attached to the allocation's `notes` field.
export function buildOverlapNote(conflictingRow: number): string {
  return `Overlap detected: date range overlaps with row ${conflictingRow} in the same import. Review and remove one if unintended.`;
}

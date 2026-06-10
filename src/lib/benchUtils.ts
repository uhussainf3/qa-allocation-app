/**
 * Pure utility functions for bench calculations.
 * Extracted for testability — imported by bench/page.tsx.
 */

// ─── Minimal input shapes ────────────────────────────────────────────────────

export type BenchUserInput = { id: string; capacity: number };
export type AllocInput     = { userId: string; hoursPerDay: number };

// ─── computeOnBenchPct ───────────────────────────────────────────────────────

/**
 * Compute on-bench percentage for a single user.
 *
 * @param capacity          Weekly capacity in hours (e.g. 40)
 * @param totalHoursPerDay  Sum of hoursPerDay across all active allocations
 * @returns                 0–100 integer; clamped to 0 if over-allocated
 */
export function computeOnBenchPct(capacity: number, totalHoursPerDay: number): number {
  const dailyCap    = capacity / 5;
  const allocPct    = dailyCap > 0 ? Math.round((totalHoursPerDay / dailyCap) * 100) : 0;
  return Math.max(0, 100 - allocPct);
}

// ─── computeBenchMap ─────────────────────────────────────────────────────────

/**
 * Build a userId → onBenchPct map for a set of users given their allocations.
 * Users not appearing in `allocations` are treated as 100% on bench.
 */
export function computeBenchMap(
  users:       BenchUserInput[],
  allocations: AllocInput[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const u of users) {
    const totalH = allocations
      .filter((a) => a.userId === u.id)
      .reduce((s, a) => s + a.hoursPerDay, 0);
    map[u.id] = computeOnBenchPct(u.capacity, totalH);
  }
  return map;
}

// ─── buildRoleTiles ──────────────────────────────────────────────────────────

/**
 * Aggregate a list of bench users into role tiles sorted descending by count.
 * Each tile carries both the resource count and the sum of onBenchPct values
 * for that role (total bench capacity in percentage points).
 * Users with null / undefined department are excluded from the result.
 */
export function buildRoleTiles(
  users: { department: string | null | undefined; onBenchPct: number }[],
): { role: string; count: number; sumBenchPct: number }[] {
  const countMap    = new Map<string, number>();
  const benchSumMap = new Map<string, number>();
  for (const u of users) {
    if (!u.department) continue;
    countMap.set(u.department,    (countMap.get(u.department)    ?? 0) + 1);
    benchSumMap.set(u.department, (benchSumMap.get(u.department) ?? 0) + u.onBenchPct);
  }
  return [...countMap.entries()]
    .map(([role, count]) => ({ role, count, sumBenchPct: benchSumMap.get(role) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

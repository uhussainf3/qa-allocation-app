/**
 * Pure helpers for the Projects page "Allocations" tab — categorising each
 * allocation as Active / Upcoming / Ended relative to today, computing the
 * allocation % (hoursPerDay vs. the resource's daily capacity), and grouping
 * + sorting rows for display.
 *
 * See CODEBASE_RULES §9b — extract-then-test pattern.
 */

export interface ProjectAllocationRow {
  id: string;
  userId: string;
  userName: string | null;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  allocationPct: number;
  hoursToDate: number;
  totalHours: number;
}

export interface GroupedProjectAllocations<T> {
  active: T[];
  upcoming: T[];
  ended: T[];
}

export type AllocationCategory = "active" | "upcoming" | "ended";

/**
 * Allocation % = hoursPerDay ÷ (weekly capacity ÷ 5) × 100, rounded.
 * Mirrors the formula used on the Allocation List / Bench pages.
 * Returns 0 if capacity is zero or negative (avoids divide-by-zero).
 */
export function computeAllocationPct(hoursPerDay: number, capacity: number): number {
  const dailyCap = capacity / 5;
  if (dailyCap <= 0) return 0;
  return Math.round((hoursPerDay / dailyCap) * 100);
}

/**
 * Categorises an allocation relative to `today` based on date (not time):
 * - "upcoming" — startDate is after today
 * - "ended"    — endDate is before today
 * - "active"   — today falls within [startDate, endDate] (inclusive)
 *
 * `today` may be a Date or an ISO/"YYYY-MM-DD" string. Only the date portion
 * (first 10 chars of the ISO representation) is compared.
 */
export function categorizeAllocation(
  startDate: string,
  endDate: string,
  today: Date | string
): AllocationCategory {
  const startStr = startDate.slice(0, 10);
  const endStr   = endDate.slice(0, 10);
  const todayStr = typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);

  if (startStr > todayStr) return "upcoming";
  if (endStr < todayStr) return "ended";
  return "active";
}

/**
 * Groups allocation rows into Active / Upcoming / Ended buckets and sorts
 * each bucket for display:
 *  - Active & Upcoming: soonest start date first
 *  - Ended: most recently ended first
 */
export function groupAllocationsByCategory<T extends { startDate: string; endDate: string }>(
  rows: T[],
  today: Date | string
): GroupedProjectAllocations<T> {
  const active: T[]   = [];
  const upcoming: T[] = [];
  const ended: T[]    = [];

  for (const row of rows) {
    const category = categorizeAllocation(row.startDate, row.endDate, today);
    if (category === "active") active.push(row);
    else if (category === "upcoming") upcoming.push(row);
    else ended.push(row);
  }

  active.sort((a, b) => a.startDate.localeCompare(b.startDate));
  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  ended.sort((a, b) => b.endDate.localeCompare(a.endDate));

  return { active, upcoming, ended };
}

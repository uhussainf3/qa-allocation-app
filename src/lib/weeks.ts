export function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();                          // use UTC day-of-week
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);                         // UTC midnight
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + weeks * 7);           // use UTC date
  return d;
}

export function getWeekRange(monday: Date): string {
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

export function getWeekLabel(monday: Date): string {
  return monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function getNextNWeeks(n: number, from?: Date): Date[] {
  const start = getMondayOf(from ?? new Date());
  return Array.from({ length: n }, (_, i) => addWeeks(start, i));
}

/** Convert a Date to a YYYY-MM-DD UTC string for holiday set lookups. */
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the number of working days (Mon–Fri, excluding public holidays)
 * within a week column that overlap with the allocation range [allocStart, allocEnd].
 *
 * @param holidays  Optional set of YYYY-MM-DD strings to skip (public holidays).
 */
export function workingDaysInWeek(
  weekMonday: Date,
  allocStart: Date,
  allocEnd:   Date,
  holidays?:  Set<string>
): number {
  const weekFriday = new Date(weekMonday);
  weekFriday.setDate(weekMonday.getDate() + 4);

  // Overlap window
  const overlapStart = allocStart > weekMonday ? allocStart : weekMonday;
  const overlapEnd   = allocEnd   < weekFriday ? allocEnd   : weekFriday;

  if (overlapStart > overlapEnd) return 0;

  let days = 0;
  const cur = new Date(overlapStart);
  while (cur <= overlapEnd) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5 && !holidays?.has(toYMD(cur))) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * Total working days (Mon–Fri, excluding public holidays) between two dates inclusive.
 *
 * @param holidays  Optional set of YYYY-MM-DD strings to skip (public holidays).
 */
export function totalWorkingDays(start: Date, end: Date, holidays?: Set<string>): number {
  if (start > end) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5 && !holidays?.has(toYMD(cur))) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

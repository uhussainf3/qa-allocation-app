import { auth } from "@/lib/auth";
import { getMondayOf, addWeeks, totalWorkingDays } from "@/lib/weeks";
import { getCachedSimpleUsers, getCachedAllocationsMinimal, getCachedPublicHolidays } from "@/lib/queries";
import { BenchClient } from "./BenchClient";

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function BenchPage({ searchParams }: PageProps) {
  await auth();
  const { from, to } = await searchParams;

  const fromDate = from ? getMondayOf(new Date(from + "T00:00:00")) : getMondayOf(new Date());
  const toDate   = to   ? getMondayOf(new Date(to   + "T00:00:00")) : fromDate;

  // Clamp so toDate is never before fromDate
  const safeToDate = toDate < fromDate ? fromDate : toDate;

  // Number of weeks in range (inclusive)
  const weekCount = Math.round((safeToDate.getTime() - fromDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  // Fetch all allocation weeks in the range
  const rangeEnd = addWeeks(safeToDate, 1); // exclusive upper bound

  const [users, rawAllocations, rawHolidays] = await Promise.all([
    getCachedSimpleUsers(),
    getCachedAllocationsMinimal(fromDate.toISOString(), rangeEnd.toISOString()),
    getCachedPublicHolidays(),
  ]);

  // Convert ISO strings back to Date objects for server-side calculations
  const allocations = rawAllocations.map((a) => ({ ...a, startDate: new Date(a.startDate), endDate: new Date(a.endDate) }));
  const holidays    = new Set(rawHolidays.map((h) => h.date));

  // Pre-compute holiday-adjusted multiplier: sum of (working_days_in_week / 5) over the range.
  // e.g. 2 weeks with 0 holidays → 2.0; week with 3 holidays → 0.4, so 2-week range = 1.4
  let weekMultiplierSum = 0;
  for (let i = 0; i < weekCount; i++) {
    let wDays = 0;
    for (let d = 0; d < 5; d++) {
      const day = new Date(fromDate.getTime() + (i * 7 + d) * 86400000);
      if (!holidays.has(day.toISOString().slice(0, 10))) wDays++;
    }
    weekMultiplierSum += wDays / 5;
  }

  const bench = users.map((u) => {
    const allocated = allocations
      .filter((a) => a.userId === u.id)
      .reduce((s, a) => {
        // Clamp to selected range, then count holiday-aware working days
        const oStart = a.startDate > fromDate  ? a.startDate : fromDate;
        const oEnd   = a.endDate   < safeToDate ? a.endDate  : safeToDate;
        const days   = totalWorkingDays(oStart, oEnd, holidays);
        return s + days * a.hoursPerDay;
      }, 0);
    // Holiday-adjusted total capacity: scales each week by its working-day fraction
    const totalCapacity = Math.round(u.capacity * weekMultiplierSum);
    const free          = Math.max(0, totalCapacity - allocated);
    const utilPct       = totalCapacity > 0 ? Math.round((allocated / totalCapacity) * 100) : 0;
    return { ...u, allocated, free, utilPct, totalCapacity };
  }).sort((a, b) => b.free - a.free);

  return (
    <BenchClient
      bench={bench}
      fromDate={fromDate.toISOString().slice(0, 10)}
      toDate={safeToDate.toISOString().slice(0, 10)}
      weekCount={weekCount}
    />
  );
}

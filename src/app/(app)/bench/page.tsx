import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMondayOf, addWeeks } from "@/lib/weeks";
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

  const [users, allocations] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, capacity: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.allocation.findMany({
      where: { startDate: { lt: rangeEnd }, endDate: { gte: fromDate } },
      select: { userId: true, hoursPerDay: true, startDate: true, endDate: true },
    }),
  ]);

  // Count working days per allocation that overlap the selected range
  function workingDaysOverlap(aStart: Date, aEnd: Date, rStart: Date, rEnd: Date): number {
    const oStart = aStart > rStart ? aStart : rStart;
    const oEnd   = aEnd   < rEnd   ? aEnd   : rEnd;
    if (oStart > oEnd) return 0;
    let days = 0;
    const cur = new Date(oStart);
    while (cur <= oEnd) {
      const d = cur.getDay();
      if (d >= 1 && d <= 5) days++;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  const bench = users.map((u) => {
    const allocated = allocations
      .filter((a) => a.userId === u.id)
      .reduce((s, a) => {
        const days = workingDaysOverlap(a.startDate, a.endDate, fromDate, safeToDate);
        return s + days * a.hoursPerDay;
      }, 0);
    const totalCapacity = u.capacity * weekCount;
    const free         = Math.max(0, totalCapacity - allocated);
    const utilPct      = totalCapacity > 0 ? Math.round((allocated / totalCapacity) * 100) : 0;
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

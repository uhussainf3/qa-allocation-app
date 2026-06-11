import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, notFound } from "@/lib/apiResponse";

/** Working days Mon–Fri that overlap both the allocation and the query range. */
function overlapDays(
  rangeStart: Date, rangeEnd: Date,
  allocStart: Date, allocEnd: Date
): number {
  const oStart = allocStart > rangeStart ? allocStart : rangeStart;
  const oEnd   = allocEnd   < rangeEnd   ? allocEnd   : rangeEnd;
  if (oStart > oEnd) return 0;
  let days = 0;
  const cur = new Date(oStart);
  while (cur <= oEnd) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  const { id } = await params;

  const item = await prisma.pipeline.findUnique({ where: { id } });
  if (!item) return notFound();

  // Fall back to a 4-week window from today if dates aren't set
  const rangeStart = item.expectedStartDate ?? new Date();
  const rawEnd     = item.expectedEndDate   ?? new Date(rangeStart.getTime() + 28 * 86400000);
  const rangeEnd   = rawEnd < rangeStart ? new Date(rangeStart.getTime() + 28 * 86400000) : rawEnd;

  // Count Mon–Fri days in the range (used to compute average hours/week)
  let totalWorkingDays = 0;
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    if (cur.getDay() >= 1 && cur.getDay() <= 5) totalWorkingDays++;
    cur.setDate(cur.getDate() + 1);
  }
  const totalWeeks = totalWorkingDays / 5;

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const users = await prisma.user.findMany({
    where:   { isActive: true },
    select:  { id: true, name: true, email: true, capacity: true, role: true },
    orderBy: { name: "asc" },
  });
  const allocations = await prisma.allocation.findMany({
    where: {
      startDate: { lt: rangeEnd   },
      endDate:   { gte: rangeStart },
    },
    select: { userId: true, startDate: true, endDate: true, hoursPerDay: true },
  });

  const suggestions = users.map((u) => {
    const userAllocs = allocations.filter((a) => a.userId === u.id);

    // Total allocated hours for this user within the range
    const allocatedHours = userAllocs.reduce((sum, a) => {
      const days = overlapDays(rangeStart, rangeEnd, a.startDate, a.endDate);
      return sum + days * a.hoursPerDay;
    }, 0);

    // Average allocated hours per week across the range
    const allocatedHPW   = totalWeeks > 0 ? allocatedHours / totalWeeks : 0;
    const availableHPW   = Math.max(0, u.capacity - allocatedHPW);
    const currentUtilPct = u.capacity > 0 ? Math.round((allocatedHPW / u.capacity) * 100) : 0;

    // After adding this pipeline work
    const afterHPW      = allocatedHPW + item.hoursPerWeek;
    const afterUtilPct  = u.capacity > 0 ? Math.round((afterHPW / u.capacity) * 100) : 0;

    const canFit        = availableHPW >= item.hoursPerWeek;
    const partialFit    = !canFit && availableHPW > 0;

    return {
      id:             u.id,
      name:           u.name,
      email:          u.email,
      role:           u.role,
      capacity:       u.capacity,
      allocatedHPW:   Math.round(allocatedHPW * 10) / 10,
      availableHPW:   Math.round(availableHPW * 10) / 10,
      currentUtilPct,
      afterUtilPct,
      canFit,
      partialFit,
    };
  })
  // Sort: full fits first (by tightest fit = lowest afterUtilPct overage), then partial fits
  .sort((a, b) => {
    if (a.canFit !== b.canFit) return a.canFit ? -1 : 1;
    return a.afterUtilPct - b.afterUtilPct;
  });

  return ok({
    rangeStart:        rangeStart.toISOString().slice(0, 10),
    rangeEnd:          rangeEnd.toISOString().slice(0, 10),
    requiredHPW:       item.hoursPerWeek,
    requiredHeadcount: item.requiredHeadcount,
    suggestions,
  });
}

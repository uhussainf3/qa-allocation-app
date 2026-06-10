import { auth } from "@/lib/auth";
import { unauthorized } from "@/lib/apiResponse";
import { NextResponse } from "next/server";
import { getCachedActiveUsers, getCachedAllocationsInRange, getCachedActiveProjects, getCachedPublicHolidays } from "@/lib/queries";
import { getMondayOf, addWeeks } from "@/lib/weeks";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/allocations/view?weeks=4[&batchId=xxx]
 * Returns { users, allocations, projects, holidays } for the Allocations grid.
 *
 * Without batchId: uses the server-side query cache (60-second TTL).
 * With batchId: queries allocations by batch directly (no cache — historical data doesn't change).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const nWeeks  = Math.min(Math.max(Number(searchParams.get("weeks") ?? 4), 1), 52);
  const batchId = searchParams.get("batchId") ?? null;

  const from = getMondayOf(new Date());
  const to   = addWeeks(from, nWeeks);

  if (batchId) {
    // Historical batch view — bypass cache, query directly
    const [users, projects, holidays, batchAllocations] = await Promise.all([
      getCachedActiveUsers(),
      getCachedActiveProjects(),
      getCachedPublicHolidays(),
      prisma.allocation.findMany({
        where: { batchId },
        include: {
          project: { select: { id: true, name: true, code: true, color: true } },
          user:    { select: { id: true, name: true, email: true } },
          task:    { select: { id: true, name: true } },
        },
      }),
    ]);
    const allocations = batchAllocations.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
    return NextResponse.json({ users, allocations, projects, holidays });
  }

  const [users, allocations, projects, holidays] = await Promise.all([
    getCachedActiveUsers(),
    getCachedAllocationsInRange(from.toISOString(), to.toISOString()),
    getCachedActiveProjects(),
    getCachedPublicHolidays(),
  ]);

  return NextResponse.json(
    { users, allocations, projects, holidays },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

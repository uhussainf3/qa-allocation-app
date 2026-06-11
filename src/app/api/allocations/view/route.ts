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
    // Historical batch view — bypass cache, query directly.
    // Sequential, not Promise.all — the Neon connection pool here is
    // configured with connection_limit=1, so issuing several Prisma
    // queries concurrently just queues them up and times out waiting for
    // a connection ("Timed out fetching a new connection from the
    // connection pool ... connection limit: 1").
    const users   = await getCachedActiveUsers();
    const projects = await getCachedActiveProjects();
    const holidays = await getCachedPublicHolidays();
    const batchAllocations = await prisma.allocation.findMany({
      where: { batchId },
      include: {
        project: { select: { id: true, name: true, code: true, color: true } },
        user:    { select: { id: true, name: true, email: true } },
        task:    { select: { id: true, name: true } },
      },
    });
    const allocations = batchAllocations.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
    return NextResponse.json({ users, allocations, projects, holidays });
  }

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1"). Each of these is independently cached
  // (60s TTL) so steady-state requests don't hit the DB at all.
  const users       = await getCachedActiveUsers();
  const allocations = await getCachedAllocationsInRange(from.toISOString(), to.toISOString());
  const projects    = await getCachedActiveProjects();
  const holidays    = await getCachedPublicHolidays();

  return NextResponse.json(
    { users, allocations, projects, holidays },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

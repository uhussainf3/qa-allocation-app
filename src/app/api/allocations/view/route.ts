import { auth } from "@/lib/auth";
import { unauthorized } from "@/lib/apiResponse";
import { NextResponse } from "next/server";
import { getCachedActiveUsers, getCachedAllocationsInRange, getCachedActiveProjects } from "@/lib/queries";
import { getMondayOf, addWeeks } from "@/lib/weeks";

/**
 * GET /api/allocations/view?weeks=4
 * Returns { users, allocations, projects } for the Allocations grid page.
 * All three datasets come from the server-side query cache (60-second TTL).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const nWeeks = Math.min(Math.max(Number(searchParams.get("weeks") ?? 4), 1), 52);

  const from = getMondayOf(new Date());
  const to   = addWeeks(from, nWeeks);

  const [users, allocations, projects] = await Promise.all([
    getCachedActiveUsers(),
    getCachedAllocationsInRange(from.toISOString(), to.toISOString()),
    getCachedActiveProjects(),
  ]);

  return NextResponse.json(
    { users, allocations, projects },
    {
      headers: {
        // Tell browser: serve stale for up to 60s, always revalidate in bg
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

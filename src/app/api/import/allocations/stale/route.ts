import { auth }    from "@/lib/auth";
import { prisma }  from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// ─── GET /api/import/allocations/stale ───────────────────────────────────────
// Returns batch allocations that are NOT present in the current batch,
// split into two sections for the Stale Allocations review screen:
//
//  Section A — withinRange:  allocation falls within the current CSV date range.
//              Likely removed from RM Tool. Suggest delete.
//
//  Section B — beyondRange:  allocation starts after the CSV's maxEnd.
//              May still be valid — RM Tool just didn't export that far.
//              Ask user to keep or delete.
//
// ADMIN: sees all stale allocations company-wide.
// DIVISION_OWNER: sees only allocations for users in their division.

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (!["ADMIN", "DIVISION_OWNER"].includes(session.user.role))
    return err("Forbidden", 403);

  // Get the current batch and its CSV range (stored in log)
  const currentBatch = await prisma.allocationBatch.findFirst({
    where:  { isCurrent: true },
    select: { id: true, label: true, uploadedAt: true, log: true },
    orderBy: { uploadedAt: "desc" },
  });

  if (!currentBatch) {
    return ok({ currentBatch: null, withinRange: [], beyondRange: [] });
  }

  const log        = currentBatch.log as Record<string, unknown> | null;
  const csvRaw     = log?.csvRange as { minStart?: string; maxEnd?: string } | undefined;
  const csvMinStart = csvRaw?.minStart ? new Date(csvRaw.minStart) : null;
  const csvMaxEnd   = csvRaw?.maxEnd   ? new Date(csvRaw.maxEnd)   : null;

  // Get (userId, projectId) pairs present in the current batch
  const currentPairs = await prisma.allocation.findMany({
    where:  { batchId: currentBatch.id },
    select: { userId: true, projectId: true },
  });
  const currentPairKeys = new Set(
    currentPairs.map((p) => `${p.userId}::${p.projectId}`)
  );

  // Division scope for DIVISION_OWNER
  let divisionUserIds: string[] | undefined;
  if (session.user.role === "DIVISION_OWNER") {
    const owner = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { divisionId: true },
    });
    if (owner?.divisionId) {
      const members = await prisma.user.findMany({
        where:  { divisionId: owner.divisionId, isActive: true },
        select: { id: true },
      });
      divisionUserIds = members.map((m) => m.id);
    }
  }

  // Fetch all batch allocations NOT in the current batch
  const staleRaw = await prisma.allocation.findMany({
    where: {
      AND: [
        { batchId: { not: null } },
        { batchId: { not: currentBatch.id } },
        ...(divisionUserIds ? [{ userId: { in: divisionUserIds } }] : []),
      ],
    },
    select: {
      id:          true,
      userId:      true,
      projectId:   true,
      startDate:   true,
      endDate:     true,
      hoursPerDay: true,
      notes:       true,
      batchId:     true,
      user:        { select: { name: true, externalId: true } },
      project:     { select: { name: true, externalId: true } },
      batch:       { select: { label: true, uploadedAt: true } },
    },
    orderBy: { startDate: "asc" },
  });

  // Filter to only those NOT represented in the current batch
  const stale = staleRaw.filter((a) => !currentPairKeys.has(`${a.userId}::${a.projectId}`));

  // Format a record for the UI
  function fmt(a: typeof stale[number]) {
    return {
      id:           a.id,
      userId:       a.userId,
      projectId:    a.projectId,
      employeeName: a.user.name   ?? a.user.externalId  ?? a.userId,
      projectName:  a.project.name ?? a.project.externalId ?? a.projectId,
      startDate:    a.startDate.toISOString(),
      endDate:      a.endDate.toISOString(),
      hoursPerDay:  a.hoursPerDay,
      allocationPct: Math.round((a.hoursPerDay / 8) * 100),
      notes:        a.notes,
      lastBatchLabel: a.batch?.label ?? "Unknown batch",
      lastUploadedAt: a.batch?.uploadedAt?.toISOString() ?? null,
    };
  }

  const withinRange: ReturnType<typeof fmt>[] = [];
  const beyondRange: ReturnType<typeof fmt>[] = [];

  for (const alloc of stale) {
    // Section B: allocation starts entirely after the CSV's maxEnd
    if (csvMaxEnd && alloc.startDate > csvMaxEnd) {
      beyondRange.push(fmt(alloc));
    } else {
      // Section A: within or overlapping the CSV range — likely removed from RM Tool
      withinRange.push(fmt(alloc));
    }
  }

  return ok({
    currentBatch: {
      id:       currentBatch.id,
      label:    currentBatch.label,
      csvRange: csvRaw ?? null,
    },
    withinRange,
    beyondRange,
  });
}

// ─── DELETE /api/import/allocations/stale ────────────────────────────────────
// Delete a specific stale allocation by id.
// Body: { id: string }
// Only ADMIN or DIVISION_OWNER (for their own division's users) can delete.

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!["ADMIN", "DIVISION_OWNER"].includes(session.user.role))
    return err("Forbidden", 403);

  const { id } = await req.json() as { id: string };
  if (!id) return err("id is required");

  // Verify the allocation is a batch allocation (not manual)
  const alloc = await prisma.allocation.findUnique({
    where:  { id },
    select: { id: true, batchId: true, userId: true, user: { select: { divisionId: true } } },
  });

  if (!alloc)            return err("Allocation not found", 404);
  if (!alloc.batchId)    return err("Cannot delete a manual allocation from this screen", 400);

  // DIVISION_OWNER scope check
  if (session.user.role === "DIVISION_OWNER") {
    const owner = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { divisionId: true },
    });
    if (owner?.divisionId && alloc.user.divisionId !== owner.divisionId) {
      return err("Forbidden — this allocation belongs to a different division", 403);
    }
  }

  await prisma.allocation.delete({ where: { id } });

  revalidateTag("allocations", "max" as never);

  return ok({ deleted: id });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized } from "@/lib/apiResponse";

// GET /api/import/allocations/batches
// Returns all AllocationBatch records, newest first, with log and uploader name.
export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const batches = await prisma.allocationBatch.findMany({
    orderBy: { uploadedAt: "desc" },
    select: {
      id:          true,
      label:       true,
      uploadedAt:  true,
      isCurrent:   true,
      sourceFile:  true,
      log:         true,
      uploadedBy:  { select: { name: true, email: true } },
      _count:      { select: { allocations: true } },
    },
  });

  return ok(
    batches.map((b) => ({
      id:              b.id,
      label:           b.label,
      uploadedAt:      b.uploadedAt.toISOString(),
      isCurrent:       b.isCurrent,
      sourceFile:      b.sourceFile,
      allocationCount: b._count.allocations,
      uploadedBy:      b.uploadedBy.name ?? b.uploadedBy.email ?? "Unknown",
      log:             b.log ?? null,
    }))
  );
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { validateMerge } from "@/lib/divisionMergeUtils";
import { z } from "zod";

const mergeSchema = z.object({
  targetId: z.string().min(1),
});

// POST /api/divisions/[id]/merge
//
// Reassigns every User and Project currently in division [id] (the
// "source") to `targetId` (the "target"), e.g. consolidating two NetSuite
// divisions ("NS" + "NETSUI") into one. After this, the source division has
// 0 members/projects and can be deleted via the existing
// DELETE /api/divisions/[id] flow.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can merge divisions", 403);

  const { id: sourceId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const { targetId } = parsed.data;
  const validation = validateMerge(sourceId, targetId);
  if (!validation.valid) return err(validation.error ?? "Invalid merge request");

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const source = await prisma.division.findUnique({ where: { id: sourceId } });
  if (!source) return notFound();
  const target = await prisma.division.findUnique({ where: { id: targetId } });
  if (!target) return notFound();

  // Single interactive transaction — one connection, atomic.
  const [usersMoved, projectsMoved] = await prisma.$transaction(async (tx) => {
    const userResult = await tx.user.updateMany({
      where: { divisionId: sourceId },
      data:  { divisionId: targetId },
    });
    const projectResult = await tx.project.updateMany({
      where: { divisionId: sourceId },
      data:  { divisionId: targetId },
    });
    return [userResult.count, projectResult.count];
  });

  revalidateTag("users", "max" as never);
  revalidateTag("projects", "max" as never);
  revalidateTag("divisions", "max" as never);

  return ok({
    success: true,
    source:  { id: source.id, code: source.code, name: source.name },
    target:  { id: target.id, code: target.code, name: target.name },
    usersMoved,
    projectsMoved,
  });
}

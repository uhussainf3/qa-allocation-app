import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const patchSchema = z.object({
  hours: z.number().min(0.5).max(24).optional(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  const { id } = await params;

  const log = await prisma.hoursLog.findUnique({ where: { id } });
  if (!log) return notFound();

  // Only the owner or an admin can edit
  if (log.userId !== session.user.id && session.user.role !== "ADMIN") {
    return forbidden();
  }

  // Can only edit DRAFT logs
  if (log.status !== "DRAFT") return err("Only DRAFT logs can be edited");

  const body   = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const updated = await prisma.hoursLog.update({
    where: { id },
    data: {
      ...(parsed.data.hours !== undefined && { hours: parsed.data.hours }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    },
  });

  revalidateTag("projects", "max");
  return ok(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  const { id } = await params;

  const log = await prisma.hoursLog.findUnique({ where: { id } });
  if (!log) return notFound();

  // Only the owner or an admin can delete
  if (log.userId !== session.user.id && session.user.role !== "ADMIN") {
    return forbidden();
  }

  // Can only delete DRAFT logs
  if (log.status !== "DRAFT") return err("Only DRAFT logs can be deleted");

  await prisma.hoursLog.delete({ where: { id } });

  revalidateTag("projects", "max");
  return ok({ deleted: true });
}

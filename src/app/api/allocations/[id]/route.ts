import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const updateSchema = z.object({
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
  hoursPerDay: z.number().min(0).max(24).optional(),
  notes:       z.string().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const { id } = await params;
  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const existing = await prisma.allocation.findUnique({ where: { id } });
  if (!existing) return notFound();

  const startDate  = parsed.data.startDate  ? new Date(parsed.data.startDate  + "T00:00:00Z") : existing.startDate;
  const endDate    = parsed.data.endDate    ? new Date(parsed.data.endDate    + "T00:00:00Z") : existing.endDate;
  const hoursPerDay = parsed.data.hoursPerDay ?? existing.hoursPerDay;

  if (endDate < startDate) return err("endDate must be on or after startDate");

  const allocation = await prisma.allocation.update({
    where: { id },
    data:  { startDate, endDate, hoursPerDay, notes: parsed.data.notes },
  });

  await prisma.auditLog.create({
    data: {
      actorId:    session.user.id,
      action:     "updated",
      targetType: "Allocation",
      targetId:   id,
      projectId:  existing.projectId,
    },
  });

  revalidateTag("allocations", "max");
  return ok(allocation);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const { id } = await params;
  const existing = await prisma.allocation.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.allocation.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorId:    session.user.id,
      action:     "deleted",
      targetType: "Allocation",
      targetId:   id,
      projectId:  existing.projectId,
    },
  });

  revalidateTag("allocations", "max");
  return ok({ success: true });
}

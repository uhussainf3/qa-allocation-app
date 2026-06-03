import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

const EDITABLE_ROLES = ["ADMIN", "DIVISION_OWNER", "PROJECT_MANAGER"];

// PATCH /api/tasks/[id]  — update a task (any field)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!EDITABLE_ROLES.includes(session.user.role as string)) {
    return err("Forbidden", 403);
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return notFound();

  const body = await req.json();
  const { name, description, assignedUserId, status, priority,
          estimatedHours, dueDate, order, parentId } = body;

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(name           !== undefined && { name: name.trim() }),
      ...(description    !== undefined && { description: description || null }),
      ...(assignedUserId !== undefined && { assignedUserId: assignedUserId || null }),
      ...(status         !== undefined && { status }),
      ...(priority       !== undefined && { priority }),
      ...(estimatedHours !== undefined && { estimatedHours: Number(estimatedHours) }),
      ...(dueDate        !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(order          !== undefined && { order: Number(order) }),
      ...(parentId       !== undefined && { parentId: parentId || null }),
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  });

  revalidateTag("projects", "max" as never);
  return ok(updated);
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!EDITABLE_ROLES.includes(session.user.role as string)) {
    return err("Forbidden", 403);
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return notFound();

  await prisma.task.delete({ where: { id } });
  revalidateTag("projects", "max" as never);
  return ok({ deleted: true });
}

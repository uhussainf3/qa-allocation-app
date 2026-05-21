import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  clientName: z.string().optional(),
  sanctionedHours: z.number().min(0).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  color: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { subtasks: { orderBy: { order: "asc" } } },
        where: { parentId: null },
        orderBy: { order: "asc" },
      },
      allocations: {
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { startDate: "asc" },
      },
    },
  });

  if (!project) return notFound();
  return ok(project);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
  });

  await prisma.auditLog.create({
    data: { actorId: session.user.id, action: "updated", targetType: "Project", targetId: id, projectId: id },
  });

  return ok(project);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN") return err("Only admins can delete projects", 403);

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return notFound();

  await prisma.project.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { actorId: session.user.id, action: "deleted", targetType: "Project", targetId: id },
  });

  return ok({ success: true });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(20),
  description: z.string().optional(),
  clientName: z.string().optional(),
  sanctionedHours: z.number().min(0).default(0),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  color: z.string().default("#6366f1"),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const projects = await prisma.project.findMany({
    include: {
      tasks: {
        include: { subtasks: true },
        where: { parentId: null },
        orderBy: { order: "asc" },
      },
      _count: { select: { allocations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok(projects);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const existing = await prisma.project.findUnique({ where: { code: parsed.data.code } });
  if (existing) return err("Project code already exists");

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "created",
      targetType: "Project",
      targetId: project.id,
      projectId: project.id,
    },
  });

  revalidateTag("projects", "max");
  return ok(project, 201);
}

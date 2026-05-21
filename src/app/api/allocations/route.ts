import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { getMondayOf } from "@/lib/weeks";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  userId:      z.string(),
  projectId:   z.string(),
  taskId:      z.string().optional().nullable(),
  startDate:   z.string(),
  endDate:     z.string(),
  hoursPerDay: z.number().min(0).max(24).default(8),
  notes:       z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const weeks  = parseInt(searchParams.get("weeks") ?? "4");

  const from = getMondayOf(new Date());
  const to   = new Date(from);
  to.setDate(to.getDate() + weeks * 7);

  const allocations = await prisma.allocation.findMany({
    where: {
      startDate: { lt: to },
      endDate:   { gte: from },
      ...(userId ? { userId } : {}),
    },
    include: {
      user:    { select: { id: true, name: true, email: true, image: true, capacity: true, role: true } },
      project: { select: { id: true, name: true, code: true, color: true } },
      task:    { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "asc" }, { userId: "asc" }],
  });

  return ok(allocations);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
    return err("Only admins and project managers can create allocations", 403);
  }

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const { userId, projectId, taskId, startDate, endDate, hoursPerDay, notes } = parsed.data;

  const start = new Date(startDate + "T00:00:00Z");
  const end   = new Date(endDate   + "T00:00:00Z");
  if (end < start) return err("endDate must be on or after startDate");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return err("User not found", 404);

  const allocation = await prisma.allocation.upsert({
    where:  { userId_projectId_startDate: { userId, projectId, startDate: start } },
    update: { endDate: end, hoursPerDay, notes, taskId },
    create: { userId, projectId, taskId, startDate: start, endDate: end, hoursPerDay, notes },
  });

  await prisma.auditLog.create({
    data: {
      actorId:    session.user.id,
      action:     "created",
      targetType: "Allocation",
      targetId:   allocation.id,
      projectId,
    },
  });

  revalidateTag("allocations", "max");
  return ok(allocation, 201);
}

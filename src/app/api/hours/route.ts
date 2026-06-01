import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string(),
  taskId: z.string().optional().nullable(),
  date: z.string(),
  hours: z.number().min(0).max(24),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? session.user.id;
  const weekStart = searchParams.get("weekStart");

  const where: Record<string, unknown> = { userId };
  if (weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    where.date = { gte: start, lt: end };
  }

  const logs = await prisma.hoursLog.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, code: true, color: true } },
      task: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

  return ok(logs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const log = await prisma.hoursLog.create({
    data: {
      userId:    session.user.id,
      projectId: parsed.data.projectId,
      taskId:    parsed.data.taskId,
      date:      new Date(parsed.data.date),
      hours:     parsed.data.hours,
      notes:     parsed.data.notes,
      status:    "DRAFT",
    },
  });

  revalidateTag("projects", "max");
  return ok(log, 201);
}

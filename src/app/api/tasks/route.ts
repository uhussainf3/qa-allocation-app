import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

const EDITABLE_ROLES = ["ADMIN", "PROJECT_MANAGER"];

// GET /api/tasks?projectId=xxx  — list all tasks (+ subtasks) for a project
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return err("projectId is required", 400);

  const tasks = await prisma.task.findMany({
    where:   { projectId, parentId: null },   // top-level only; subtasks nested below
    include: {
      subtasks: {
        include: {
          assignedUser: { select: { id: true, name: true } },
          hoursLogs:    { select: { hours: true } },
        },
        orderBy: { order: "asc" },
      },
      assignedUser: { select: { id: true, name: true } },
      hoursLogs:    { select: { hours: true } },
    },
    orderBy: { order: "asc" },
  });

  // Attach actualHours to each task
  function shape(t: typeof tasks[number] | typeof tasks[number]["subtasks"][number]) {
    const actualHours = t.hoursLogs.reduce((s, l) => s + l.hours, 0);
    return {
      id:             t.id,
      name:           t.name,
      description:    t.description,
      projectId:      t.projectId,
      parentId:       t.parentId,
      assignedUserId: t.assignedUserId,
      assignedUser:   t.assignedUser,
      status:         t.status,
      priority:       t.priority,
      estimatedHours: t.estimatedHours,
      dueDate:        t.dueDate?.toISOString() ?? null,
      jiraId:         t.jiraId,
      jiraKey:        t.jiraKey,
      order:          t.order,
      actualHours:    Math.round(actualHours * 10) / 10,
      createdAt:      t.createdAt.toISOString(),
      updatedAt:      t.updatedAt.toISOString(),
    };
  }

  return ok(tasks.map((t) => ({
    ...shape(t),
    subtasks: ("subtasks" in t ? t.subtasks : []).map(shape),
  })));
}

// POST /api/tasks  — create a task
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!EDITABLE_ROLES.includes(session.user.role as string)) {
    return err("Forbidden", 403);
  }

  const body = await req.json();
  const { projectId, name, description, parentId, assignedUserId,
          status, priority, estimatedHours, dueDate, order } = body;

  if (!projectId || !name?.trim()) return err("projectId and name are required", 400);

  const task = await prisma.task.create({
    data: {
      projectId,
      name:           name.trim(),
      description:    description    || null,
      parentId:       parentId       || null,
      assignedUserId: assignedUserId || null,
      status:         status         || "TODO",
      priority:       priority       || "MEDIUM",
      estimatedHours: Number(estimatedHours) || 0,
      dueDate:        dueDate ? new Date(dueDate) : null,
      order:          Number(order)  || 0,
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  });

  revalidateTag("projects", "max" as never);
  return ok(task, 201);
}

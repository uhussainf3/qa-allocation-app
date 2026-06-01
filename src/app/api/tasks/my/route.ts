import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized } from "@/lib/apiResponse";

// GET /api/tasks/my  — all tasks assigned to the current user, across all projects
export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const tasks = await prisma.task.findMany({
    where:   { assignedUserId: session.user.id },
    include: {
      project:  { select: { id: true, name: true, code: true, color: true } },
      hoursLogs: { select: { hours: true } },
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
  });

  return ok(tasks.map((t) => ({
    id:             t.id,
    name:           t.name,
    description:    t.description,
    projectId:      t.projectId,
    project:        t.project,
    parentId:       t.parentId,
    status:         t.status,
    priority:       t.priority,
    estimatedHours: t.estimatedHours,
    dueDate:        t.dueDate?.toISOString() ?? null,
    jiraKey:        t.jiraKey,
    actualHours:    Math.round(t.hoursLogs.reduce((s, l) => s + l.hours, 0) * 10) / 10,
    createdAt:      t.createdAt.toISOString(),
    updatedAt:      t.updatedAt.toISOString(),
  })));
}

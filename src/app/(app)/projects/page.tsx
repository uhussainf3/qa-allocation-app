import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totalWorkingDays } from "@/lib/weeks";
import { ProjectsClient } from "./ProjectsClient";
import type { Role } from "@/types/enums";

export default async function ProjectsPage() {
  const session = await auth();

  const [projects, hoursConsumed, allocations] = await Promise.all([
    prisma.project.findMany({
      include: {
        tasks: {
          include: { subtasks: { orderBy: { order: "asc" } } },
          where: { parentId: null },
          orderBy: { order: "asc" },
        },
        _count: { select: { allocations: true, hoursLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.hoursLog.groupBy({
      by: ["projectId"],
      _sum: { hours: true },
    }),
    prisma.allocation.findMany({
      select: { projectId: true, startDate: true, endDate: true, hoursPerDay: true },
    }),
  ]);

  const consumedMap = Object.fromEntries(hoursConsumed.map((h) => [h.projectId, h._sum.hours ?? 0]));

  // Sum allocated hours per project: working days in range * hoursPerDay
  const allocatedMap: Record<string, number> = {};
  for (const a of allocations) {
    const days = totalWorkingDays(a.startDate, a.endDate);
    const hrs  = Math.round(days * a.hoursPerDay * 10) / 10;
    allocatedMap[a.projectId] = (allocatedMap[a.projectId] ?? 0) + hrs;
  }

  return (
    <ProjectsClient
      projects={projects.map((p) => ({
        ...p,
        startDate: p.startDate?.toISOString() ?? null,
        endDate: p.endDate?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        consumedHours: consumedMap[p.id] ?? 0,
        allocatedHours: Math.round((allocatedMap[p.id] ?? 0) * 10) / 10,
        tasks: p.tasks.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          subtasks: t.subtasks.map((s) => ({
            ...s,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
        })),
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

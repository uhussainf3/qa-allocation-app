import { auth } from "@/lib/auth";
import { totalWorkingDays } from "@/lib/weeks";
import { ProjectsClient } from "./ProjectsClient";
import { getCachedProjectsFull, getCachedAllAllocationsForProjects } from "@/lib/queries";
import type { Role } from "@/types/enums";

export default async function ProjectsPage() {
  const session = await auth();

  const [{ projects, hoursConsumed }, allocations] = await Promise.all([
    getCachedProjectsFull(),
    getCachedAllAllocationsForProjects(),
  ]);

  const consumedMap = Object.fromEntries(hoursConsumed.map((h) => [h.projectId, h._sum.hours ?? 0]));

  // Sum allocated hours per project: working days in range * hoursPerDay
  const allocatedMap: Record<string, number> = {};
  for (const a of allocations) {
    const days = totalWorkingDays(new Date(a.startDate), new Date(a.endDate));
    const hrs  = Math.round(days * a.hoursPerDay * 10) / 10;
    allocatedMap[a.projectId] = (allocatedMap[a.projectId] ?? 0) + hrs;
  }

  return (
    <ProjectsClient
      projects={projects.map((p) => ({
        ...p,
        consumedHours:  consumedMap[p.id] ?? 0,
        allocatedHours: Math.round((allocatedMap[p.id] ?? 0) * 10) / 10,
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

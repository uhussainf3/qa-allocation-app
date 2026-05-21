import { auth } from "@/lib/auth";
import { totalWorkingDays } from "@/lib/weeks";
import { ProjectsClient } from "./ProjectsClient";
import { getCachedProjectsFull, getCachedAllAllocationsForProjects, getCachedPublicHolidays } from "@/lib/queries";
import type { Role } from "@/types/enums";

export default async function ProjectsPage() {
  const session = await auth();

  const [{ projects, hoursConsumed }, allocations, rawHolidays] = await Promise.all([
    getCachedProjectsFull(),
    getCachedAllAllocationsForProjects(),
    getCachedPublicHolidays(),
  ]);

  const holidays = new Set(rawHolidays.map((h) => h.date));

  const consumedMap = Object.fromEntries(hoursConsumed.map((h) => [h.projectId, h._sum.hours ?? 0]));

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Sum allocated hours, hours-to-date, and per-engineer breakdown per project
  const allocatedMap: Record<string, number> = {};
  const hoursToDateMap: Record<string, number> = {};
  type EngineerEntry = { userId: string; userName: string | null; hoursToDate: number; totalAllocated: number };
  const engineerBreakdownMap: Record<string, Record<string, EngineerEntry>> = {};

  for (const a of allocations) {
    const start = new Date(a.startDate);
    const end   = new Date(a.endDate);

    // Full-range allocated hours
    const totalDays = totalWorkingDays(start, end, holidays);
    const totalHrs  = Math.round(totalDays * a.hoursPerDay * 10) / 10;
    allocatedMap[a.projectId] = (allocatedMap[a.projectId] ?? 0) + totalHrs;

    // Hours worked up to today
    const effectiveEnd = end < today ? end : today;
    const toDateDays   = start > today ? 0 : totalWorkingDays(start, effectiveEnd, holidays);
    const toDateHrs    = Math.round(toDateDays * a.hoursPerDay * 10) / 10;
    hoursToDateMap[a.projectId] = (hoursToDateMap[a.projectId] ?? 0) + toDateHrs;

    // Per-engineer accumulation
    if (!engineerBreakdownMap[a.projectId]) engineerBreakdownMap[a.projectId] = {};
    if (!engineerBreakdownMap[a.projectId][a.userId]) {
      engineerBreakdownMap[a.projectId][a.userId] = {
        userId: a.userId, userName: a.userName, hoursToDate: 0, totalAllocated: 0,
      };
    }
    engineerBreakdownMap[a.projectId][a.userId].hoursToDate    += toDateHrs;
    engineerBreakdownMap[a.projectId][a.userId].totalAllocated += totalHrs;
  }

  return (
    <ProjectsClient
      projects={projects.map((p) => ({
        ...p,
        consumedHours:  consumedMap[p.id] ?? 0,
        allocatedHours: Math.round((allocatedMap[p.id] ?? 0) * 10) / 10,
        hoursToDate:    Math.round((hoursToDateMap[p.id] ?? 0) * 10) / 10,
        engineerBreakdown: Object.values(engineerBreakdownMap[p.id] ?? {})
          .map((e) => ({
            ...e,
            hoursToDate:    Math.round(e.hoursToDate    * 10) / 10,
            totalAllocated: Math.round(e.totalAllocated * 10) / 10,
          }))
          .sort((a, b) => b.totalAllocated - a.totalAllocated),
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { totalWorkingDays } from "@/lib/weeks";
import { getCachedAllAllocationsForProjects, getCachedPublicHolidays } from "@/lib/queries";
import { canViewExecutiveDashboard } from "@/lib/accessUtils";
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "Executive Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canViewExecutiveDashboard(session.user.role, session.user.jobTitle)) redirect("/");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // ── Fetch everything sequentially ───────────────────────────────────────────
  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing many Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").

  // Divisions with counts
  const divisions = await prisma.division.findMany({
    include: {
      owner:    { select: { id: true, name: true } },
      _count:   { select: { members: true, projects: true } },
    },
    orderBy: { name: "asc" },
  });

  // Active users (excluding VP job title)
  const allUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ jobTitle: null }, { jobTitle: { not: "VP" } }],
    },
    select:  { id: true, name: true, email: true, role: true, jobTitle: true, capacity: true, divisionId: true, department: true, isOnshore: true },
    orderBy: { name: "asc" },
  });

  // Today's allocations
  const activeAllocations = await prisma.allocation.findMany({
    where:   { startDate: { lte: today }, endDate: { gte: today } },
    select:  { userId: true, hoursPerDay: true, projectId: true, endDate: true,
                project: { select: { id: true, name: true, divisionId: true } } },
  });

  // Active projects
  const projects = await prisma.project.findMany({
    where:   { status: "ACTIVE" },
    select:  { id: true, name: true, code: true, color: true, divisionId: true, sanctionedHours: true,
                _count: { select: { allocations: true, tasks: true } } },
    orderBy: { name: "asc" },
  });

  // Pending leaves
  const openLeaves = await prisma.leave.findMany({
    where:   { status: "PENDING" },
    select:  { id: true, userId: true, type: true, startDate: true, endDate: true,
                user: { select: { name: true, divisionId: true, department: true } } },
  });

  // Pipeline opportunities
  const pipeline = await prisma.pipeline.findMany({
    where:   { status: { notIn: ["WON", "LOST"] } },
    select:  { id: true, name: true, status: true, probability: true, dealSize: true,
                requiredHeadcount: true, hoursPerWeek: true, expectedStartDate: true },
    orderBy: { probability: "desc" },
  });

  // Recent allocations ending soon (next 14 days)
  const recentAllocations = await prisma.allocation.findMany({
    where: {
      endDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) },
    },
    select: {
      userId: true, endDate: true,
      user:    { select: { name: true, divisionId: true, department: true } },
      project: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
    take: 20,
  });

  // All projects with billing fields — used to compute Top Projects by Hours-to-Date
  const billingProjects = await prisma.project.findMany({
    select: {
      id: true, name: true, code: true, color: true, status: true,
      divisionId: true, sanctionedHours: true, hourlyRate: true,
      manager: { select: { name: true } },
    },
  });

  // All allocations (date ranges) — used to compute hours-to-date per project
  const allProjectAllocations = await getCachedAllAllocationsForProjects();

  // Public holidays — needed for working-day calculations
  const rawHolidays = await getCachedPublicHolidays();

  const holidays = new Set(rawHolidays.map((h) => h.date));

  // ── Serialise dates ────────────────────────────────────────────────────────
  const serialisedDivisions = divisions.map((d) => ({
    id:        d.id,
    name:      d.name,
    code:      d.code,
    color:     d.color,
    isActive:  d.isActive,
    owner:     d.owner,
    memberCount:  d._count.members,
    projectCount: d._count.projects,
  }));

  // Per-division utilisation
  const divStats = serialisedDivisions.map((d) => {
    const members = allUsers.filter((u) => u.divisionId === d.id);
    const divCap  = members.reduce((s, u) => s + u.capacity / 5, 0);
    const divAlloc = activeAllocations
      .filter((a) => members.some((u) => u.id === a.userId))
      .reduce((s, a) => s + a.hoursPerDay, 0);
    const pct = divCap > 0 ? Math.round((divAlloc / divCap) * 100) : 0;
    return { ...d, utilPct: pct, headcount: members.length };
  });

  // ── Top projects by Hours-to-Date (with billed-amount figures) ──────────────
  const hoursToDateMap:   Record<string, number>                   = {};
  const allocatedHoursMap: Record<string, number>                  = {};
  // deptHoursMap[projectId][department] = hoursToDate contributed by that dept
  const deptHoursMap: Record<string, Record<string, number>>       = {};
  // deptAllocatedMap[projectId][department] = total allocated hours contributed by that dept
  const deptAllocatedMap: Record<string, Record<string, number>>   = {};
  const departmentSet = new Set<string>();

  for (const a of allProjectAllocations) {
    const start = new Date(a.startDate);
    const end   = new Date(a.endDate);

    const totalDays = totalWorkingDays(start, end, holidays);
    const allocHrs  = Math.round(totalDays * a.hoursPerDay * 10) / 10;
    allocatedHoursMap[a.projectId] = (allocatedHoursMap[a.projectId] ?? 0) + allocHrs;

    const effectiveEnd = end < today ? end : today;
    const toDateDays   = start > today ? 0 : totalWorkingDays(start, effectiveEnd, holidays);
    const toDateHrs    = Math.round(toDateDays * a.hoursPerDay * 10) / 10;
    hoursToDateMap[a.projectId] = (hoursToDateMap[a.projectId] ?? 0) + toDateHrs;

    // per-department breakdown
    if (a.department) {
      departmentSet.add(a.department);
      if (!deptHoursMap[a.projectId]) deptHoursMap[a.projectId] = {};
      deptHoursMap[a.projectId][a.department] =
        (deptHoursMap[a.projectId][a.department] ?? 0) + toDateHrs;

      if (!deptAllocatedMap[a.projectId]) deptAllocatedMap[a.projectId] = {};
      deptAllocatedMap[a.projectId][a.department] =
        (deptAllocatedMap[a.projectId][a.department] ?? 0) + allocHrs;
    }
  }

  // All projects with hours activity — NOT pre-sliced; client does the top-10 cut
  const topProjects = billingProjects
    .map((p) => {
      const hoursToDate    = Math.round((hoursToDateMap[p.id]    ?? 0) * 10) / 10;
      const allocatedHours = Math.round((allocatedHoursMap[p.id] ?? 0) * 10) / 10;
      const rate           = p.hourlyRate ?? 0;
      return {
        id: p.id, name: p.name, code: p.code, color: p.color, status: p.status,
        divisionId: p.divisionId, managerName: p.manager?.name ?? null,
        sanctionedHours: p.sanctionedHours, hourlyRate: p.hourlyRate,
        hoursToDate, allocatedHours,
        contractedValue: Math.round(p.sanctionedHours * rate * 100) / 100,
        allocatedValue:  Math.round(allocatedHours    * rate * 100) / 100,
        billedToDate:    Math.round(hoursToDate       * rate * 100) / 100,
        departmentHours: deptHoursMap[p.id] ?? {},
        departmentAllocatedHours: deptAllocatedMap[p.id] ?? {},
      };
    })
    .filter((p) => p.hoursToDate > 0)
    .sort((a, b) => b.hoursToDate - a.hoursToDate);

  const departments = [...departmentSet].sort();

  // ── Data for client-side Division/Role filtering of KPI tiles ──────────────
  const usersForStats = allUsers.map((u) => ({
    id: u.id, divisionId: u.divisionId, department: u.department, capacity: u.capacity, isOnshore: u.isOnshore,
  }));
  const allocationsForStats = activeAllocations.map((a) => ({
    userId: a.userId, projectId: a.projectId, hoursPerDay: a.hoursPerDay,
  }));
  const activeProjectsForStats = projects.map((p) => ({ id: p.id, divisionId: p.divisionId }));
  const leavesForStats = openLeaves.map((l) => ({
    divisionId: l.user.divisionId, department: l.user.department,
  }));

  return (
    <DashboardClient
      todayISO={todayISO}
      pipelineCount={pipeline.length}
      users={usersForStats}
      allocations={allocationsForStats}
      activeProjects={activeProjectsForStats}
      leaves={leavesForStats}
      divStats={divStats}
      topProjects={topProjects}
      departments={departments}
      endingSoon={recentAllocations.map((a) => ({
        userName:    a.user.name ?? "—",
        projectName: a.project.name,
        divisionId:  a.user.divisionId,
        department:  a.user.department,
        endDate:     a.endDate.toISOString(),
      }))}
      pipeline={pipeline.map((p) => ({
        ...p,
        expectedStartDate: p.expectedStartDate?.toISOString() ?? null,
      }))}
      allDivisions={serialisedDivisions}
    />
  );
}

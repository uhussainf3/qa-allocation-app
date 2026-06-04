import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "Executive Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "EXECUTIVE") redirect("/");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // ── Fetch everything in one big parallel shot ──────────────────────────────
  const [
    divisions,
    allUsers,
    activeAllocations,
    projects,
    openLeaves,
    pipeline,
    recentAllocations,
  ] = await Promise.all([
    // Divisions with counts
    prisma.division.findMany({
      include: {
        owner:    { select: { id: true, name: true } },
        _count:   { select: { members: true, projects: true } },
      },
      orderBy: { name: "asc" },
    }),

    // Active users (excluding VP job title)
    prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ jobTitle: null }, { jobTitle: { not: "VP" } }],
      },
      select:  { id: true, name: true, email: true, role: true, jobTitle: true, capacity: true, divisionId: true },
      orderBy: { name: "asc" },
    }),

    // Today's allocations
    prisma.allocation.findMany({
      where:   { startDate: { lte: today }, endDate: { gte: today } },
      select:  { userId: true, hoursPerDay: true, projectId: true, endDate: true,
                  project: { select: { id: true, name: true, divisionId: true } } },
    }),

    // Active projects
    prisma.project.findMany({
      where:   { status: "ACTIVE" },
      select:  { id: true, name: true, code: true, color: true, divisionId: true, sanctionedHours: true,
                  _count: { select: { allocations: true, tasks: true } } },
      orderBy: { name: "asc" },
    }),

    // Pending leaves
    prisma.leave.findMany({
      where:   { status: "PENDING" },
      select:  { id: true, userId: true, type: true, startDate: true, endDate: true,
                  user: { select: { name: true, divisionId: true } } },
    }),

    // Pipeline opportunities
    prisma.pipeline.findMany({
      where:   { status: { notIn: ["WON", "LOST"] } },
      select:  { id: true, name: true, status: true, probability: true, dealSize: true,
                  requiredHeadcount: true, hoursPerWeek: true, expectedStartDate: true },
      orderBy: { probability: "desc" },
    }),

    // Recent allocations ending soon (next 14 days)
    prisma.allocation.findMany({
      where: {
        endDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) },
      },
      select: {
        userId: true, endDate: true,
        user:    { select: { name: true, divisionId: true } },
        project: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
      take: 20,
    }),
  ]);

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

  const totalCapacity     = allUsers.reduce((s, u) => s + u.capacity / 5, 0); // daily
  const allocatedH        = activeAllocations.reduce((s, a) => s + a.hoursPerDay, 0);
  const utilPct           = totalCapacity > 0 ? Math.round((allocatedH / totalCapacity) * 100) : 0;
  const benchCount        = allUsers.filter((u) => {
    const myH = activeAllocations.filter((a) => a.userId === u.id).reduce((s, a) => s + a.hoursPerDay, 0);
    const cap  = u.capacity / 5;
    return cap > 0 && myH < cap;
  }).length;

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

  return (
    <DashboardClient
      todayISO={todayISO}
      totalHeadcount={allUsers.length}
      utilPct={utilPct}
      benchCount={benchCount}
      activeProjectCount={projects.length}
      pendingLeaveCount={openLeaves.length}
      pipelineCount={pipeline.length}
      divStats={divStats}
      endingSoon={recentAllocations.map((a) => ({
        userName:    a.user.name ?? "—",
        projectName: a.project.name,
        divisionId:  a.user.divisionId,
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

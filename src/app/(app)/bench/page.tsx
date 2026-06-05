import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedSimpleUsers, getCachedDivisions, getCachedActiveProjects } from "@/lib/queries";
import { BenchClient } from "./BenchClient";

export default async function BenchPage() {
  await auth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const day30 = new Date(today);
  day30.setDate(today.getDate() + 30);

  const [allActiveUsers, allocToday, alloc30, divisions, projects] = await Promise.all([
    getCachedSimpleUsers(),
    prisma.allocation.findMany({
      where:   { startDate: { lte: today }, endDate: { gte: today } },
      include: { project: { select: { id: true, name: true, color: true, managerId: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.allocation.findMany({
      where:  { startDate: { lte: day30 }, endDate: { gte: day30 } },
      select: { userId: true, hoursPerDay: true },
    }),
    getCachedDivisions(),
    getCachedActiveProjects(),
  ]);

  // Exclude onshore resources from bench entirely
  const users = allActiveUsers.filter((u) => !u.isOnshore);

  // Today's bench — full data with project chips
  const bench = users
    .map((u) => {
      const dailyCap     = u.capacity / 5;
      const myAllocs     = allocToday.filter((a) => a.userId === u.id);
      const allocatedH   = myAllocs.reduce((s, a) => s + a.hoursPerDay, 0);
      const allocatedPct = dailyCap > 0 ? Math.round((allocatedH / dailyCap) * 100) : 0;
      const onBenchPct   = Math.max(0, 100 - allocatedPct);

      const currentAllocations = myAllocs.map((a) => ({
        projectId:    a.project.id,
        projectName:  a.project.name,
        projectColor: a.project.color,
        pct:          dailyCap > 0 ? Math.round((a.hoursPerDay / dailyCap) * 100) : 0,
        endDate:      a.endDate.toISOString(),
      }));

      return { ...u, allocatedPct, onBenchPct, currentAllocations };
    })
    .filter((u) => u.onBenchPct > 0)
    .sort((a, b) => b.onBenchPct - a.onBenchPct);

  // +30-day bench — lean snapshot (bench% only per user)
  const bench30: Record<string, number> = {};
  for (const u of users) {
    const dailyCap   = u.capacity / 5;
    const allocatedH = alloc30.filter((a) => a.userId === u.id).reduce((s, a) => s + a.hoursPerDay, 0);
    const pct        = dailyCap > 0 ? Math.round((allocatedH / dailyCap) * 100) : 0;
    bench30[u.id]    = Math.max(0, 100 - pct);
  }

  // Build PM → Set<userId> map from today's allocations (project-based)
  const pmUserMap: Record<string, string[]> = {};
  for (const a of allocToday) {
    const pmId = a.project.managerId;
    if (pmId) {
      if (!pmUserMap[pmId]) pmUserMap[pmId] = [];
      if (!pmUserMap[pmId].includes(a.userId)) pmUserMap[pmId].push(a.userId);
    }
  }

  return (
    <BenchClient
      bench={bench}
      bench30={bench30}
      allUsers={users.map((u) => ({ id: u.id, name: u.name, email: u.email, capacity: u.capacity, role: u.role, jobTitle: u.jobTitle, department: u.department, divisionId: u.divisionId, managerId: u.managerId }))}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))}
      pmUserMap={pmUserMap}
    />
  );
}

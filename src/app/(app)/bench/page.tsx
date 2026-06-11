import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedSimpleUsers, getCachedDivisions, getCachedActiveProjects } from "@/lib/queries";
import { computeBenchMap } from "@/lib/benchUtils";
import { BenchClient } from "./BenchClient";

export default async function BenchPage() {
  await auth();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const day30 = new Date(today);
  day30.setUTCDate(today.getUTCDate() + 30);

  const day60 = new Date(today);
  day60.setUTCDate(today.getUTCDate() + 60);

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const allActiveUsers = await getCachedSimpleUsers();
  const allocToday = await prisma.allocation.findMany({
    where:   { startDate: { lte: today }, endDate: { gte: today } },
    include: { project: { select: { id: true, name: true, color: true, managerId: true } } },
    orderBy: { endDate: "asc" },
  });
  const alloc30 = await prisma.allocation.findMany({
    where:  { startDate: { lte: day30 }, endDate: { gte: day30 } },
    select: { userId: true, hoursPerDay: true },
  });
  const alloc60 = await prisma.allocation.findMany({
    where:  { startDate: { lte: day60 }, endDate: { gte: day60 } },
    select: { userId: true, hoursPerDay: true },
  });
  const divisions = await getCachedDivisions();
  const projects  = await getCachedActiveProjects();

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
  const bench30 = computeBenchMap(users, alloc30);

  // +60-day bench — lean snapshot (bench% only per user)
  const bench60 = computeBenchMap(users, alloc60);

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
      bench60={bench60}
      allUsers={users.map((u) => ({ id: u.id, name: u.name, email: u.email, capacity: u.capacity, role: u.role, jobTitle: u.jobTitle, department: u.department, divisionId: u.divisionId, managerId: u.managerId }))}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color }))}
      pmUserMap={pmUserMap}
    />
  );
}

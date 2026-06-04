import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedSimpleUsers, getCachedDivisions } from "@/lib/queries";
import { BenchClient } from "./BenchClient";

export default async function BenchPage() {
  await auth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [users, activeAllocations, divisions] = await Promise.all([
    getCachedSimpleUsers(),
    prisma.allocation.findMany({
      where: {
        startDate: { lte: today },
        endDate:   { gte: today },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    getCachedDivisions(),
  ]);

  const bench = users
    .map((u) => {
      const dailyCap    = u.capacity / 5;
      const myAllocs    = activeAllocations.filter((a) => a.userId === u.id);
      const allocatedH  = myAllocs.reduce((s, a) => s + a.hoursPerDay, 0);
      const allocatedPct = dailyCap > 0 ? Math.round((allocatedH / dailyCap) * 100) : 0;
      const onBenchPct  = Math.max(0, 100 - allocatedPct);

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

  return (
    <BenchClient
      bench={bench}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
    />
  );
}

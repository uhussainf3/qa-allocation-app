import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AllocationsClient } from "./AllocationsClient";
import { getNextNWeeks, getWeekLabel, getWeekRange, getMondayOf } from "@/lib/weeks";
import type { Role } from "@/types/enums";

interface PageProps {
  searchParams: Promise<{ weeks?: string }>;
}

export default async function AllocationsPage({ searchParams }: PageProps) {
  const session = await auth();
  const { weeks: weeksParam } = await searchParams;
  const nWeeks = Math.min(Math.max(Number(weeksParam ?? 4), 1), 52);

  const weeks    = getNextNWeeks(nWeeks);
  const allWeeks = getNextNWeeks(26);

  const from = getMondayOf(new Date());
  const to   = new Date(from);
  to.setDate(to.getDate() + nWeeks * 7);

  const [users, allocations, projects] = await Promise.all([
    prisma.user.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, email: true, image: true, capacity: true, role: true },
      orderBy: { name: "asc" },
    }),
    // Fetch any allocation that overlaps the displayed range
    prisma.allocation.findMany({
      where: {
        startDate: { lt: to },
        endDate:   { gte: from },
      },
      include: {
        project: { select: { id: true, name: true, code: true, color: true } },
        task:    { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where:  { status: "ACTIVE" },
      select: { id: true, name: true, code: true, color: true },
    }),
  ]);

  const toMeta = (w: Date, i: number) => ({
    date:      w.toISOString(),
    label:     getWeekLabel(w),
    range:     getWeekRange(w),
    isCurrent: i === 0,
  });

  return (
    <AllocationsClient
      users={users.map((u) => ({ ...u, role: u.role as Role }))}
      allocations={allocations.map((a) => ({
        ...a,
        startDate: a.startDate.toISOString(),
        endDate:   a.endDate.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))}
      projects={projects}
      weeks={weeks.map(toMeta)}
      allWeeks={allWeeks.map(toMeta)}
      currentUserRole={session!.user.role}
    />
  );
}

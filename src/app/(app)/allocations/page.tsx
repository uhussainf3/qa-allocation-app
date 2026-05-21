import { auth } from "@/lib/auth";
import { AllocationsClient } from "./AllocationsClient";
import { getNextNWeeks, getWeekLabel, getWeekRange, getMondayOf } from "@/lib/weeks";
import { getCachedActiveUsers, getCachedAllocationsInRange, getCachedActiveProjects } from "@/lib/queries";
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
    getCachedActiveUsers(),
    getCachedAllocationsInRange(from.toISOString(), to.toISOString()),
    getCachedActiveProjects(),
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
      allocations={allocations}
      projects={projects}
      weeks={weeks.map(toMeta)}
      allWeeks={allWeeks.map(toMeta)}
      currentUserRole={session!.user.role}
    />
  );
}

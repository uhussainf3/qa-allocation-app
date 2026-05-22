import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoursClient } from "./HoursClient";
import { getMondayOf } from "@/lib/weeks";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function HoursPage({ searchParams }: PageProps) {
  const session = await auth();
  const { week } = await searchParams;

  // If a ?week= param is given use that Monday; otherwise default to this week
  const monday = week
    ? getMondayOf(new Date(week + "T00:00:00Z"))   // force UTC so getUTCDay() sees the correct day
    : getMondayOf(new Date());

  const [projects, logs] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, code: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.hoursLog.findMany({
      where: {
        userId: session!.user.id,
        date: { gte: monday, lt: new Date(monday.getTime() + 7 * 86400000) },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        task:    { select: { id: true, name: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <HoursClient
      projects={projects}
      logs={logs.map((l) => ({
        ...l,
        date:      l.date.toISOString(),
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      }))}
      weekStart={monday.toISOString()}
    />
  );
}

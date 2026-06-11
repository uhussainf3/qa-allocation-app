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

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, code: true, color: true },
    orderBy: { name: "asc" },
  });
  const logs = await prisma.hoursLog.findMany({
    where: {
      userId: session!.user.id,
      date: { gte: monday, lt: new Date(monday.getTime() + 7 * 86400000) },
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      task:    { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

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

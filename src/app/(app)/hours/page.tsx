import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoursClient } from "./HoursClient";
import { getMondayOf } from "@/lib/weeks";

export default async function HoursPage() {
  const session = await auth();
  const monday = getMondayOf(new Date());

  const [projects, logs] = await Promise.all([
    prisma.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true, color: true }, orderBy: { name: "asc" } }),
    prisma.hoursLog.findMany({
      where: { userId: session!.user.id, date: { gte: monday, lt: new Date(monday.getTime() + 7 * 86400000) } },
      include: { project: { select: { id: true, name: true, color: true } }, task: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <HoursClient
      projects={projects}
      logs={logs.map((l) => ({ ...l, date: l.date.toISOString(), createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString() }))}
      weekStart={monday.toISOString()}
    />
  );
}

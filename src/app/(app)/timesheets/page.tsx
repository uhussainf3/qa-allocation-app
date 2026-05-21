import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TimesheetsClient } from "./TimesheetsClient";

export default async function TimesheetsPage() {
  const session = await auth();
  const canSeeAll = ["ADMIN", "PROJECT_MANAGER"].includes(session!.user.role);

  const timesheets = await prisma.timesheet.findMany({
    where: canSeeAll ? {} : { userId: session!.user.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      hoursLogs: { include: { project: { select: { id: true, name: true, color: true } } } },
    },
    orderBy: { weekStart: "desc" },
    take: 50,
  });

  return (
    <TimesheetsClient
      timesheets={timesheets.map((t) => ({
        ...t,
        weekStart: t.weekStart.toISOString(),
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        submittedAt: t.submittedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        hoursLogs: t.hoursLogs.map((l) => ({ ...l, date: l.date.toISOString(), createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString() })),
      }))}
      canReview={canSeeAll}
    />
  );
}

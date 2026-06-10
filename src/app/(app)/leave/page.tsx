import { auth }        from "@/lib/auth";
import { prisma }      from "@/lib/prisma";
import { LeaveClient } from "./LeaveClient";
import type { Role }   from "@/types/enums";

export default async function LeavePage() {
  const session   = await auth();
  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(
    session!.user.role
  );

  const where = canSeeAll
    ? {}
    : {
        OR: [
          { userId: session!.user.id },
          { approvals: { some: { approverId: session!.user.id } } },
        ],
      };

  const leaves = await prisma.leave.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { startDate: "asc" },
  });

  // ── Fetch overlapping allocations for all leave users ──────────────────────
  // Used to map each PM approver back to the project(s) they manage for that
  // employee — gives context on why each person is in the approval chain.
  const leaveUserIds = [...new Set(leaves.map((l) => l.userId))];
  const allAllocations = leaveUserIds.length > 0
    ? await prisma.allocation.findMany({
        where: { userId: { in: leaveUserIds } },
        select: {
          userId:    true,
          startDate: true,
          endDate:   true,
          project:   { select: { id: true, name: true, managerId: true } },
        },
      })
    : [];

  // Build managerId → projectName[] map for allocations that overlap a leave
  function mgrProjectMap(userId: string, lStart: Date, lEnd: Date): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const a of allAllocations) {
      if (a.userId !== userId)     continue;
      if (a.startDate > lEnd)      continue;
      if (a.endDate   < lStart)    continue;
      const mid = a.project.managerId;
      if (!mid) continue;
      if (!map[mid]) map[mid] = [];
      if (!map[mid].includes(a.project.name)) map[mid].push(a.project.name);
    }
    return map;
  }

  return (
    <LeaveClient
      leaves={leaves.map((l) => {
        const mgr2proj = mgrProjectMap(l.userId, l.startDate, l.endDate);
        return {
          ...l,
          startDate: l.startDate.toISOString(),
          endDate:   l.endDate.toISOString(),
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
          approvals: l.approvals.map((a) => ({
            id:            a.id,
            approverId:    a.approverId,
            approverName:  a.approver?.name  ?? null,
            approverEmail: a.approver?.email ?? null,
            projectNames:  mgr2proj[a.approverId] ?? [],
            level:         a.level,
            status:        a.status,
            comment:       a.comment,
            createdAt:     a.createdAt.toISOString(),
          })),
        };
      })}
      currentUserRole={session!.user.role as Role}
      currentUserId={session!.user.id}
    />
  );
}

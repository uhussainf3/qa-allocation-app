import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeaveClient } from "./LeaveClient";
import type { Role } from "@/types/enums";

export default async function LeavePage() {
  const session = await auth();
  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(session!.user.role);

  const leaves = await prisma.leave.findMany({
    where: canSeeAll ? {} : { userId: session!.user.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { startDate: "asc" },
  });

  return (
    <LeaveClient
      leaves={leaves.map((l) => ({
        ...l,
        startDate: l.startDate.toISOString(),
        endDate: l.endDate.toISOString(),
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      }))}
      currentUserRole={session!.user.role as Role}
      currentUserId={session!.user.id}
    />
  );
}

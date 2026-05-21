import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AllocationListClient } from "./AllocationListClient";
import type { Role } from "@/types/enums";

export default async function AllocationListPage() {
  const session = await auth();

  const allocations = await prisma.allocation.findMany({
    include: {
      user:    { select: { id: true, name: true, email: true, image: true, capacity: true, role: true } },
      project: { select: { id: true, name: true, code: true, color: true } },
      task:    { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "asc" }, { user: { name: "asc" } }],
  });

  return (
    <AllocationListClient
      allocations={allocations.map((a) => ({
        ...a,
        startDate: a.startDate.toISOString(),
        endDate:   a.endDate.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        user: { ...a.user, role: a.user.role as Role },
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

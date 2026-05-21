import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequestsClient } from "./RequestsClient";
import type { Role } from "@/types/enums";

export default async function RequestsPage() {
  const session = await auth();
  const canSeeAll = ["ADMIN", "PROJECT_MANAGER"].includes(session!.user.role);

  const [requests, projects, users] = await Promise.all([
    prisma.resourceRequest.findMany({
      where: canSeeAll ? {} : { requestedById: session!.user.id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true } }),
    canSeeAll ? prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <RequestsClient
      requests={requests.map((r) => ({
        ...r,
        startDate: r.startDate?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }))}
      projects={projects}
      users={users.map((u) => ({ ...u, role: u.role as Role }))}
      canReview={canSeeAll}
    />
  );
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequestsClient } from "./RequestsClient";
import type { Role } from "@/types/enums";

export default async function RequestsPage() {
  const session = await auth();
  const canSeeAll = ["ADMIN", "PROJECT_MANAGER"].includes(session!.user.role);

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const requests = await prisma.resourceRequest.findMany({
    where: canSeeAll ? {} : { requestedById: session!.user.id },
    include: {
      project: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const projects = await prisma.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true } });
  const users = canSeeAll
    ? await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })
    : [];

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

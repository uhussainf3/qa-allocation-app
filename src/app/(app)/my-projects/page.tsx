import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCachedActiveUsers, getCachedDivisions } from "@/lib/queries";
import { MyProjectsClient } from "./MyProjectsClient";

export const metadata = { title: "My Projects" };

export default async function MyProjectsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role   = session.user.role;
  const userId = session.user.id;

  if (!["ADMIN", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(role)) redirect("/");

  // Fetch projects — ADMIN sees all, others see their own
  const projectWhere = role === "ADMIN"
    ? {}
    : { managerId: userId };

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const projects = await prisma.project.findMany({
    where: { ...projectWhere, status: { in: ["ACTIVE", "ON_HOLD"] } },
    include: {
      manager: { select: { id: true, name: true } },
      allocations: {
        where: { endDate: { gte: oneWeekAgo } },
        include: {
          user: {
            select: { id: true, name: true, email: true, capacity: true, department: true, divisionId: true },
          },
        },
        orderBy: { startDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const [allUsers, divisions] = await Promise.all([
    getCachedActiveUsers(),
    getCachedDivisions(),
  ]);

  // PM options for admin's PM filter dropdown
  const pmUsers = allUsers.filter((u) =>
    u.role === "PROJECT_MANAGER" || u.role === "DIVISION_OWNER"
  );

  const serialised = projects.map((p) => ({
    ...p,
    startDate:  p.startDate?.toISOString()  ?? null,
    endDate:    p.endDate?.toISOString()    ?? null,
    createdAt:  p.createdAt.toISOString(),
    updatedAt:  p.updatedAt.toISOString(),
    allocations: p.allocations.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  }));

  return (
    <MyProjectsClient
      projects={serialised}
      allUsers={allUsers}
      divisions={divisions}
      pmUsers={pmUsers}
      currentUserId={userId}
      currentUserRole={role}
    />
  );
}

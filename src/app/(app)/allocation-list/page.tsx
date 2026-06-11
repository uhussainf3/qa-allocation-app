import { auth } from "@/lib/auth";
import { AllocationListClient } from "./AllocationListClient";
import { getCachedAllAllocationsList, getCachedDivisions, getCachedActiveUsers } from "@/lib/queries";
import type { Role, JobTitle } from "@/types/enums";

export default async function AllocationListPage() {
  const session = await auth();
  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1"). Each of these is independently cached
  // (60s TTL) so steady-state requests don't hit the DB at all.
  const allocations = await getCachedAllAllocationsList();
  const divisions   = await getCachedDivisions();
  const allUsers    = await getCachedActiveUsers();

  const projectManagers = allUsers
    .filter((u) => (u.role === "PROJECT_MANAGER" || u.role === "DIVISION_OWNER") && u.divisionId)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, divisionId: u.divisionId }));

  return (
    <AllocationListClient
      allocations={allocations.map((a) => ({
        ...a,
        user: { ...a.user, role: a.user.role as Role, jobTitle: a.user.jobTitle as JobTitle | null },
      }))}
      currentUserRole={session!.user.role as Role}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      projectManagers={projectManagers}
    />
  );
}

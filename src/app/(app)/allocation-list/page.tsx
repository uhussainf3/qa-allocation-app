import { auth } from "@/lib/auth";
import { AllocationListClient } from "./AllocationListClient";
import { getCachedAllAllocationsList, getCachedDivisions, getCachedActiveUsers } from "@/lib/queries";
import type { Role, JobTitle } from "@/types/enums";

export default async function AllocationListPage() {
  const session = await auth();
  const [allocations, divisions, allUsers] = await Promise.all([
    getCachedAllAllocationsList(),
    getCachedDivisions(),
    getCachedActiveUsers(),
  ]);

  const projectManagers = allUsers
    .filter((u) => u.role === "PROJECT_MANAGER")
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

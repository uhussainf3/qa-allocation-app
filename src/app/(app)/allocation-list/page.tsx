import { auth } from "@/lib/auth";
import { AllocationListClient } from "./AllocationListClient";
import { getCachedAllAllocationsList, getCachedDivisions } from "@/lib/queries";
import type { Role, JobTitle } from "@/types/enums";

export default async function AllocationListPage() {
  const session = await auth();
  const [allocations, divisions] = await Promise.all([
    getCachedAllAllocationsList(),
    getCachedDivisions(),
  ]);

  return (
    <AllocationListClient
      allocations={allocations.map((a) => ({
        ...a,
        user: { ...a.user, role: a.user.role as Role, jobTitle: a.user.jobTitle as JobTitle | null },
      }))}
      currentUserRole={session!.user.role as Role}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
    />
  );
}

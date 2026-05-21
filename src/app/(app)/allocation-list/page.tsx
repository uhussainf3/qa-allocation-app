import { auth } from "@/lib/auth";
import { AllocationListClient } from "./AllocationListClient";
import { getCachedAllAllocationsList } from "@/lib/queries";
import type { Role } from "@/types/enums";

export default async function AllocationListPage() {
  const session = await auth();
  const allocations = await getCachedAllAllocationsList();

  return (
    <AllocationListClient
      allocations={allocations.map((a) => ({
        ...a,
        user: { ...a.user, role: a.user.role as Role },
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

import { auth } from "@/lib/auth";
import { AllocationsClient } from "./AllocationsClient";
import { getCachedDivisions } from "@/lib/queries";
import type { Role } from "@/types/enums";

/** Page is intentionally thin — all data fetching happens client-side. */
export default async function AllocationsPage() {
  const session   = await auth();
  const divisions = await getCachedDivisions();

  return (
    <AllocationsClient
      currentUserRole={session!.user.role as Role}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
    />
  );
}

import { auth } from "@/lib/auth";
import { AllocationsClient } from "./AllocationsClient";
import type { Role } from "@/types/enums";

/** Page is intentionally thin — all data fetching happens client-side. */
export default async function AllocationsPage() {
  const session = await auth();
  return <AllocationsClient currentUserRole={session!.user.role as Role} />;
}

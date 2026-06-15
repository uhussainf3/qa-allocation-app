// Pure access-control predicates shared by the middleware (src/proxy.ts),
// the /dashboard page guard, and the Sidebar nav filter — keeping all three
// in sync from one source of truth (CODEBASE_RULES §9b).

import type { Role } from "@/types/enums";

/**
 * Returns true if a user can view the Executive Dashboard (/dashboard).
 *
 * Allowed for:
 *  - role === "ADMIN" or "EXECUTIVE" (company-wide access by role), OR
 *  - any user whose jobTitle is "VP" — e.g. a Division Owner who also
 *    holds a VP title should see company-wide numbers even though their
 *    `role` field is DIVISION_OWNER.
 */
export function canViewExecutiveDashboard(role: Role, jobTitle?: string | null): boolean {
  if (role === "ADMIN" || role === "EXECUTIVE") return true;
  return jobTitle === "VP";
}

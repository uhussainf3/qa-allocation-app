// Pure access-control predicates shared by the middleware (src/proxy.ts),
// the /dashboard page guard, and the Sidebar nav filter — keeping all three
// in sync from one source of truth (CODEBASE_RULES §9b).

import type { Role } from "@/types/enums";

/**
 * Returns true if a user can view the Executive Dashboard (/dashboard).
 *
 * Allowed for:
 *  - role === "ADMIN", "EXECUTIVE", or "DIVISION_OWNER" (by role), OR
 *  - any user whose jobTitle is "VP".
 */
export function canViewExecutiveDashboard(role: Role, jobTitle?: string | null): boolean {
  if (role === "ADMIN" || role === "EXECUTIVE" || role === "DIVISION_OWNER") return true;
  return jobTitle === "VP";
}

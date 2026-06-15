// Pure helper functions for the Executive Dashboard's Division + Role filters.
//
// When the user picks a "Role" (User.department) from the dropdown, every
// KPI tile, the Division Breakdown cards, and the "Allocations Ending Soon"
// panel should reflect only that role (combined with the existing Division
// filter where applicable) — EXCEPT the Pipeline panel, which has no
// per-user department association and is always shown unfiltered.

export interface DashboardUser {
  id: string;
  divisionId: string | null;
  department: string | null;
  capacity: number; // weekly capacity hours
}

export interface DashboardAllocation {
  userId: string;
  projectId: string;
  hoursPerDay: number;
}

export interface DashboardActiveProject {
  id: string;
  divisionId: string | null;
}

export interface DashboardLeave {
  divisionId: string | null;
  department: string | null;
}

export interface DashboardEndingSoonItem {
  divisionId: string | null;
  department: string | null;
}

export interface DivisionRoleStat {
  id: string;
  headcount: number;
  utilPct: number;
}

/** Returns users matching the division filter (User.divisionId) and/or role filter (User.department). */
export function filterUsers(
  users: DashboardUser[],
  divisionFilter: string,
  roleFilter: string
): DashboardUser[] {
  return users.filter((u) => {
    if (divisionFilter && u.divisionId !== divisionFilter) return false;
    if (roleFilter && u.department !== roleFilter) return false;
    return true;
  });
}

/** Utilisation % = today's allocated hours / total daily capacity, for the given user set. */
export function computeUtilPct(users: DashboardUser[], allocations: DashboardAllocation[]): number {
  const totalCapacity = users.reduce((s, u) => s + u.capacity / 5, 0);
  if (totalCapacity <= 0) return 0;
  const userIds = new Set(users.map((u) => u.id));
  const allocatedHours = allocations
    .filter((a) => userIds.has(a.userId))
    .reduce((s, a) => s + a.hoursPerDay, 0);
  return Math.round((allocatedHours / totalCapacity) * 100);
}

/** Count of users in the set who are not fully allocated today (capacity > 0 and allocated < capacity). */
export function computeBenchCount(users: DashboardUser[], allocations: DashboardAllocation[]): number {
  return users.filter((u) => {
    const myHours = allocations
      .filter((a) => a.userId === u.id)
      .reduce((s, a) => s + a.hoursPerDay, 0);
    const cap = u.capacity / 5;
    return cap > 0 && myHours < cap;
  }).length;
}

/**
 * Count of active projects relevant to the current Division/Role filters.
 * - No filters: total count of active projects.
 * - Division filter only: active projects within that division.
 * - Role filter (with or without division): distinct active projects (scoped
 *   to the division, if set) that have at least one allocation today from a
 *   user in `filteredUsers`.
 */
export function computeActiveProjectCount(
  activeProjects: DashboardActiveProject[],
  allocations: DashboardAllocation[],
  filteredUsers: DashboardUser[],
  divisionFilter: string,
  roleFilter: string
): number {
  if (!divisionFilter && !roleFilter) return activeProjects.length;

  const scopedProjects = divisionFilter
    ? activeProjects.filter((p) => p.divisionId === divisionFilter)
    : activeProjects;

  if (!roleFilter) return scopedProjects.length;

  const scopedIds  = new Set(scopedProjects.map((p) => p.id));
  const userIds    = new Set(filteredUsers.map((u) => u.id));
  const projectIds = new Set(
    allocations
      .filter((a) => userIds.has(a.userId) && scopedIds.has(a.projectId))
      .map((a) => a.projectId)
  );
  return projectIds.size;
}

/** Count of pending leave requests, scoped to the Division/Role filters. */
export function computeFilteredLeaveCount(
  leaves: DashboardLeave[],
  divisionFilter: string,
  roleFilter: string
): number {
  return leaves.filter((l) => {
    if (divisionFilter && l.divisionId !== divisionFilter) return false;
    if (roleFilter && l.department !== roleFilter) return false;
    return true;
  }).length;
}

/** Filters the "ending soon" list by Division and/or Role (department). */
export function filterEndingSoon<T extends DashboardEndingSoonItem>(
  items: T[],
  divisionFilter: string,
  roleFilter: string
): T[] {
  return items.filter((e) => {
    if (divisionFilter && e.divisionId !== divisionFilter) return false;
    if (roleFilter && e.department !== roleFilter) return false;
    return true;
  });
}

/** Recomputes per-division headcount + utilisation for the given Role filter. */
export function buildDivisionRoleStats(
  divisionIds: string[],
  users: DashboardUser[],
  allocations: DashboardAllocation[],
  roleFilter: string
): DivisionRoleStat[] {
  return divisionIds.map((id) => {
    const members = users.filter((u) => u.divisionId === id && (!roleFilter || u.department === roleFilter));
    return {
      id,
      headcount: members.length,
      utilPct: computeUtilPct(members, allocations),
    };
  });
}

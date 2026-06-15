// Pure helpers for the ADMIN "Danger Zone" full-data-reset feature.
//
// The reset itself (src/app/api/admin/reset/route.ts) is a sequence of
// Prisma deleteMany() calls inside a single transaction — that part is
// Prisma-query territory and is covered by an integration test instead
// (see CODEBASE_RULES §9b/§9d). The pieces below are pure functions used
// to build the dry-run summary shown to the admin and to gate the
// destructive POST behind an exact confirmation phrase, and those ARE
// unit tested here.

/** Counts of records that the reset operation would delete. */
export interface ResetCounts {
  divisions: number;
  projects: number;
  users: number;
  allocations: number;
  allocationBatches: number;
  leaves: number;
  leaveApprovals: number;
  hoursLogs: number;
  timesheets: number;
  tasks: number;
  resourceRequests: number;
  userSkills: number;
  notifications: number;
  auditLogs: number;
  pipeline: number;
}

/** Display row built from a ResetCounts entry. */
export interface ResetSummaryRow {
  key: keyof ResetCounts;
  label: string;
  count: number;
}

/** Human-readable labels for each table, in display order. */
export const RESET_LABELS: Record<keyof ResetCounts, string> = {
  divisions:         "Divisions",
  projects:          "Projects",
  users:             "Users (everyone except your account)",
  allocations:       "Allocations",
  allocationBatches: "Allocation import batches",
  leaves:            "Leave requests",
  leaveApprovals:    "Leave approvals",
  hoursLogs:         "Hours log entries",
  timesheets:        "Timesheets",
  tasks:             "Tasks",
  resourceRequests:  "Resource requests",
  userSkills:        "Skill assignments",
  notifications:     "Notifications",
  auditLogs:         "Audit log entries",
  pipeline:          "Pipeline opportunities",
};

/** Tables that are preserved by the reset (never deleted). */
export const RESET_PRESERVED_LABELS: string[] = [
  "Your own account, login session and notification preferences",
  "Job title list",
  "Public holidays",
  "Skill catalogue (skill names/categories)",
];

/** Build the ordered rows shown in the dry-run preview. */
export function buildResetSummary(counts: ResetCounts): ResetSummaryRow[] {
  return (Object.keys(RESET_LABELS) as (keyof ResetCounts)[]).map((key) => ({
    key,
    label: RESET_LABELS[key],
    count: counts[key],
  }));
}

/** Total number of records across all tables that would be deleted. */
export function totalRecordsToDelete(counts: ResetCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/** Exact phrase the admin must type to enable the destructive action. */
export const RESET_CONFIRM_PHRASE = "DELETE ALL DATA";

/**
 * Returns true only if the supplied input exactly matches the required
 * confirmation phrase (after trimming surrounding whitespace). Case and
 * internal spacing must match exactly — this is intentionally strict so a
 * stray keypress can't accidentally trigger the reset.
 */
export function isResetConfirmed(input: string | null | undefined): boolean {
  if (!input) return false;
  return input.trim() === RESET_CONFIRM_PHRASE;
}

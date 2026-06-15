// Pure helpers for the ADMIN "Merge division" action on the Divisions page.
//
// The merge itself (src/app/api/divisions/[id]/merge/route.ts) is two Prisma
// updateMany() calls inside a transaction — Prisma-query territory, covered
// by an integration test instead (CODEBASE_RULES §9b/§9d). The pieces below
// are the pure validation + preview-math used by the UI and unit tested here.

export interface DivisionMergeCandidate {
  id:           string;
  code:         string;
  name:         string;
  memberCount:  number;
  projectCount: number;
}

export interface MergeValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a proposed division merge (source → target) before any request
 * is sent. Both ids must be present and different — merging a division into
 * itself is a no-op the API should never need to see.
 */
export function validateMerge(sourceId: string, targetId: string): MergeValidationResult {
  if (!sourceId || !targetId) {
    return { valid: false, error: "Choose a target division to merge into." };
  }
  if (sourceId === targetId) {
    return { valid: false, error: "Source and target divisions must be different." };
  }
  return { valid: true };
}

export interface MergePreview {
  usersToMove:             number;
  projectsToMove:          number;
  resultingTargetMembers:  number;
  resultingTargetProjects: number;
  sourceEmptyAfterMerge:   boolean;
}

/**
 * Computes the before/after counts shown to the admin prior to confirming a
 * merge. After the merge, `source` will have 0 members and 0 projects (both
 * are reassigned to `target`), so it becomes eligible for deletion via the
 * existing "delete empty division" flow.
 */
export function buildMergePreview(
  source: DivisionMergeCandidate,
  target: DivisionMergeCandidate
): MergePreview {
  return {
    usersToMove:             source.memberCount,
    projectsToMove:          source.projectCount,
    resultingTargetMembers:  target.memberCount + source.memberCount,
    resultingTargetProjects: target.projectCount + source.projectCount,
    sourceEmptyAfterMerge:   true,
  };
}

/** Divisions other than `currentId` — the valid set of merge targets. */
export function mergeTargetOptions<T extends { id: string }>(divisions: T[], currentId: string): T[] {
  return divisions.filter((d) => d.id !== currentId);
}

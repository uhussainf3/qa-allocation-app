/**
 * Pure utility functions for the multi-level leave approval workflow.
 * Extracted for testability — mirrors the logic in /api/leave/route.ts.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ApprovalRecord = {
  approverId: string;
  level:      number;           // 1 = PM, 2 = Division Owner / Admin
  status:     string;           // "PENDING" | "APPROVED" | "REJECTED"
};

// ─── buildApprovalChain ──────────────────────────────────────────────────────

/**
 * Build the approval-chain records to create when a leave is submitted.
 *
 * Rules (mirrors POST /api/leave):
 * - Each PM in l1ApproverIds gets a Level-1 record.
 * - divOwnerId gets a Level-2 record — UNLESS they are the only Level-1
 *   approver (avoids a duplicate record when the DO is acting as the sole PM).
 * - If both l1ApproverIds is empty AND divOwnerId is null, returns [].
 */
export function buildApprovalChain(
  l1ApproverIds: string[],
  divOwnerId:    string | null,
): { level: number; approverId: string }[] {
  const chain: { level: number; approverId: string }[] = [];

  for (const pmId of l1ApproverIds) {
    chain.push({ level: 1, approverId: pmId });
  }

  // Skip L2 when the DO is already the sole L1 approver
  const doIsSoleL1 =
    divOwnerId !== null &&
    l1ApproverIds.length === 1 &&
    l1ApproverIds[0] === divOwnerId;

  if (divOwnerId && !doIsSoleL1) {
    chain.push({ level: 2, approverId: divOwnerId });
  }

  return chain;
}

// ─── allL1Approved ───────────────────────────────────────────────────────────

/**
 * Return true only when there is at least one Level-1 record and ALL of them
 * are in the "APPROVED" state.
 */
export function allL1Approved(approvals: ApprovalRecord[]): boolean {
  const l1 = approvals.filter((a) => a.level === 1);
  return l1.length > 0 && l1.every((a) => a.status === "APPROVED");
}

// ─── anyL1Rejected ───────────────────────────────────────────────────────────

/**
 * Return true when at least one Level-1 approver has rejected the leave.
 */
export function anyL1Rejected(approvals: ApprovalRecord[]): boolean {
  return approvals
    .filter((a) => a.level === 1)
    .some((a) => a.status === "REJECTED");
}

// ─── deriveLeaveStatus ───────────────────────────────────────────────────────

/**
 * Compute the aggregate leave status from the current set of approval records.
 *
 * State machine:
 *   PENDING     → all L1 approved, L2 approved    → APPROVED
 *   PENDING     → all L1 approved, L2 rejected    → REJECTED
 *   PENDING     → all L1 approved, L2 pending     → PM_APPROVED
 *   PENDING     → all L1 approved, no L2 exists   → APPROVED  (auto-approve)
 *   PM_APPROVED → L2 approved                     → APPROVED
 *   PM_APPROVED → L2 rejected                     → REJECTED
 *   any         → any L1 still pending             → PENDING
 *   any         → any L1 rejected (L2 not yet)    → PENDING (pending DO)
 */
export function deriveLeaveStatus(approvals: ApprovalRecord[]): string {
  const l1 = approvals.filter((a) => a.level === 1);
  const l2 = approvals.filter((a) => a.level === 2);

  // L2 decision is final
  if (l2.some((a) => a.status === "APPROVED")) return "APPROVED";
  if (l2.some((a) => a.status === "REJECTED")) return "REJECTED";

  // All L1 approved
  if (l1.length > 0 && l1.every((a) => a.status === "APPROVED")) {
    return l2.length === 0 ? "APPROVED" : "PM_APPROVED";
  }

  return "PENDING";
}

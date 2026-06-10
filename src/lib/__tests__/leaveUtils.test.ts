import { describe, it, expect } from "vitest";
import {
  buildApprovalChain,
  allL1Approved,
  anyL1Rejected,
  deriveLeaveStatus,
  type ApprovalRecord,
} from "../leaveUtils";

// ─── Helper builders ──────────────────────────────────────────────────────────

function rec(approverId: string, level: number, status: string): ApprovalRecord {
  return { approverId, level, status };
}

const PENDING  = "PENDING";
const APPROVED = "APPROVED";
const REJECTED = "REJECTED";

// ─────────────────────────────────────────────────────────────────────────────
// buildApprovalChain
// ─────────────────────────────────────────────────────────────────────────────

describe("buildApprovalChain", () => {
  it("creates one L1 record for a single PM and one L2 record for the DO", () => {
    const chain = buildApprovalChain(["pm1"], "do1");
    expect(chain).toHaveLength(2);
    expect(chain[0]).toEqual({ level: 1, approverId: "pm1" });
    expect(chain[1]).toEqual({ level: 2, approverId: "do1" });
  });

  it("creates multiple L1 records when several PMs are involved", () => {
    const chain = buildApprovalChain(["pm1", "pm2", "pm3"], "do1");
    expect(chain).toHaveLength(4);
    expect(chain.filter((r) => r.level === 1)).toHaveLength(3);
    expect(chain.filter((r) => r.level === 2)).toHaveLength(1);
  });

  it("does NOT add an L2 record when the DO is the sole L1 approver", () => {
    // Resource has no PM allocations → DO acts as the only L1 approver
    const chain = buildApprovalChain(["do1"], "do1");
    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual({ level: 1, approverId: "do1" });
  });

  it("DOES add an L2 record when the DO is one of multiple L1 approvers", () => {
    // DO happens to also be a PM on one project, but there are other PMs too
    const chain = buildApprovalChain(["pm1", "do1"], "do1");
    expect(chain.filter((r) => r.level === 1)).toHaveLength(2);
    expect(chain.filter((r) => r.level === 2)).toHaveLength(1);
    expect(chain.find((r) => r.level === 2)?.approverId).toBe("do1");
  });

  it("returns only L1 records and no L2 when divOwnerId is null", () => {
    const chain = buildApprovalChain(["pm1", "pm2"], null);
    expect(chain).toHaveLength(2);
    expect(chain.every((r) => r.level === 1)).toBe(true);
  });

  it("returns an empty chain when both l1ApproverIds and divOwnerId are absent", () => {
    const chain = buildApprovalChain([], null);
    expect(chain).toEqual([]);
  });

  it("handles the admin-fallback scenario (no PMs, no DO → admin acts as sole L1)", () => {
    // In this case l1ApproverIds = [adminId] and divOwnerId = adminId
    // → admin is the sole L1 → no L2 added
    const chain = buildApprovalChain(["admin1"], "admin1");
    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual({ level: 1, approverId: "admin1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// allL1Approved
// ─────────────────────────────────────────────────────────────────────────────

describe("allL1Approved", () => {
  it("returns true when the single L1 record is APPROVED", () => {
    expect(allL1Approved([rec("pm1", 1, APPROVED)])).toBe(true);
  });

  it("returns true when all multiple L1 records are APPROVED", () => {
    expect(
      allL1Approved([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, APPROVED),
        rec("pm3", 1, APPROVED),
      ])
    ).toBe(true);
  });

  it("returns false when one L1 record is still PENDING", () => {
    expect(
      allL1Approved([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, PENDING),
      ])
    ).toBe(false);
  });

  it("returns false when one L1 record is REJECTED", () => {
    expect(
      allL1Approved([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, REJECTED),
      ])
    ).toBe(false);
  });

  it("returns false when there are no L1 records at all", () => {
    expect(allL1Approved([rec("do1", 2, PENDING)])).toBe(false);
  });

  it("ignores L2 records — returns true even when L2 is still PENDING", () => {
    expect(
      allL1Approved([
        rec("pm1", 1, APPROVED),
        rec("do1", 2, PENDING),
      ])
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// anyL1Rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("anyL1Rejected", () => {
  it("returns true when at least one L1 record is REJECTED", () => {
    expect(
      anyL1Rejected([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, REJECTED),
      ])
    ).toBe(true);
  });

  it("returns false when all L1 records are APPROVED", () => {
    expect(
      anyL1Rejected([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, APPROVED),
      ])
    ).toBe(false);
  });

  it("returns false when all L1 records are PENDING", () => {
    expect(
      anyL1Rejected([
        rec("pm1", 1, PENDING),
        rec("pm2", 1, PENDING),
      ])
    ).toBe(false);
  });

  it("returns false when there are no L1 records", () => {
    expect(anyL1Rejected([rec("do1", 2, REJECTED)])).toBe(false);
  });

  it("ignores L2 REJECTED records when checking L1", () => {
    // L2 rejected but L1 all approved → anyL1Rejected = false
    expect(
      anyL1Rejected([
        rec("pm1", 1, APPROVED),
        rec("do1", 2, REJECTED),
      ])
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveLeaveStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveLeaveStatus", () => {
  it("returns PENDING when all records are still PENDING", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, PENDING),
        rec("do1", 2, PENDING),
      ])
    ).toBe("PENDING");
  });

  it("returns PM_APPROVED when all L1 approved but L2 still pending", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, APPROVED),
        rec("do1", 2, PENDING),
      ])
    ).toBe("PM_APPROVED");
  });

  it("returns APPROVED when all L1 approved and L2 approved", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, APPROVED),
        rec("do1", 2, APPROVED),
      ])
    ).toBe("APPROVED");
  });

  it("returns REJECTED when L2 rejects (even if all L1 approved)", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, APPROVED),
        rec("do1", 2, REJECTED),
      ])
    ).toBe("REJECTED");
  });

  it("returns APPROVED (auto-approve) when all L1 approved and there is no L2 record", () => {
    // This happens when the DO was the sole L1 approver and approved
    expect(
      deriveLeaveStatus([rec("do1", 1, APPROVED)])
    ).toBe("APPROVED");
  });

  it("returns PENDING when one L1 is approved but another is still pending", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, APPROVED),
        rec("pm2", 1, PENDING),
        rec("do1", 2, PENDING),
      ])
    ).toBe("PENDING");
  });

  it("returns PENDING when a PM has rejected (L2 has not yet decided)", () => {
    // PM rejected — status stays PENDING until DO makes a final decision.
    // L2 is still PENDING so no REJECTED state yet.
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, REJECTED),
        rec("pm2", 1, APPROVED),
        rec("do1", 2, PENDING),
      ])
    ).toBe("PENDING");
  });

  it("returns REJECTED immediately when L2 rejects regardless of L1 states", () => {
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, PENDING),
        rec("do1", 2, REJECTED),
      ])
    ).toBe("REJECTED");
  });

  it("returns APPROVED immediately when L2 approves regardless of L1 states", () => {
    // Edge case: admin overrides directly via L2
    expect(
      deriveLeaveStatus([
        rec("pm1", 1, PENDING),
        rec("do1", 2, APPROVED),
      ])
    ).toBe("APPROVED");
  });
});

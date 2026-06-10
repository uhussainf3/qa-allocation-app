/**
 * Integration tests for GET /api/leave
 *
 * WHY these exist
 * ───────────────
 * Unit tests (leaveUtils.test.ts) verify pure logic in isolation.
 * They cannot see the gap between what the DB query returns and what the client
 * component consumes.  This test suite exercises the *full route handler* with
 * mocked DB + auth and asserts the exact JSON shape that LeaveClient.tsx expects.
 *
 * THE BUG THIS GUARDS AGAINST (Dec 2025)
 * ───────────────────────────────────────
 * Prisma's `include: { approver: { select: { name, email } } }` returns a
 * NESTED object:  `approval.approver.name`
 * But LeaveClient types expect a FLAT string: `approval.approverName`
 *
 * When the GET API returned the raw Prisma shape, refreshLeaves() after any
 * approve/reject call updated state from the API — and `approverName` was
 * undefined, so the popup showed the raw cuid ("cm3x...") instead of the name.
 *
 * The test "flattens approver.name into approverName" below would have caught
 * this immediately.
 *
 * SCOPE
 * ─────
 * - GET /api/leave — response shape contract (9 scenarios)
 * - Authentication guard (2 scenarios)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Next.js runtime modules before they are imported by the route ─────────

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

// Replace NextResponse with the standard Web API Response so the route runs
// in a plain Node.js Vitest environment without the full Next.js runtime.
vi.mock("@/lib/apiResponse", () => ({
  ok: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  err: (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  forbidden: () =>
    new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  notFound: () =>
    new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    // GET uses these two; POST/PATCH use the rest — all needed so the module loads
    leave:         { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    allocation:    { findMany: vi.fn() },
    user:          { findUnique: vi.fn(), findFirst: vi.fn() },
    division:      { findUnique: vi.fn() },
    leaveApproval: { createMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    notification:  { create: vi.fn() },
  },
}));

// ── Import actual route handler (after mocks are registered) ──────────────────

import { GET } from "@/app/api/leave/route";
import { prisma } from "@/lib/prisma";
import { auth }   from "@/lib/auth";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ADMIN_SESSION  = { user: { id: "admin1",  role: "ADMIN"  } };
const MEMBER_SESSION = { user: { id: "member1", role: "MEMBER" } };

/**
 * Raw shape as Prisma returns it — approver is a NESTED object.
 * This is what the route handler receives from the DB mock.
 * The handler must transform it to the flat shape the client expects.
 */
const PRISMA_LEAVE_ROW = {
  id:             "leave1",
  userId:         "user1",
  type:           "PTO",
  startDate:      new Date("2026-06-01T00:00:00Z"),
  endDate:        new Date("2026-06-05T00:00:00Z"),
  reason:         "Annual leave",
  status:         "PENDING",
  approvedBy:     null,
  clientApproval: null,
  backupPlan:     null,
  createdAt:      new Date("2026-05-20T10:00:00Z"),
  updatedAt:      new Date("2026-05-20T10:00:00Z"),
  user: { id: "user1", name: "John Dev", email: "john@folio3.com", image: null },
  approvals: [
    {
      id:         "appr1",
      leaveId:    "leave1",
      approverId: "pm1",
      level:      1,
      status:     "PENDING",
      comment:    null,
      createdAt:  new Date("2026-05-20T10:00:00Z"),
      updatedAt:  new Date("2026-05-20T10:00:00Z"),
      // ← NESTED — raw Prisma shape. The route handler must flatten this.
      approver: { id: "pm1", name: "Jane Manager", email: "jane@folio3.com" },
    },
    {
      id:         "appr2",
      leaveId:    "leave1",
      approverId: "do1",
      level:      2,
      status:     "PENDING",
      comment:    null,
      createdAt:  new Date("2026-05-20T10:00:00Z"),
      updatedAt:  new Date("2026-05-20T10:00:00Z"),
      approver: { id: "do1", name: "Bob Owner", email: "bob@folio3.com" },
    },
  ],
};

/** Two allocations overlapping the leave, both managed by pm1 */
const PRISMA_ALLOC_ROWS = [
  {
    userId:    "user1",
    startDate: new Date("2026-05-01T00:00:00Z"),
    endDate:   new Date("2026-07-31T00:00:00Z"),
    project:   { id: "proj1", name: "Project Alpha", managerId: "pm1" },
  },
  {
    userId:    "user1",
    startDate: new Date("2026-06-01T00:00:00Z"),
    endDate:   new Date("2026-06-30T00:00:00Z"),
    project:   { id: "proj2", name: "Project Beta", managerId: "pm1" },
  },
];

function makeRequest(path = "http://localhost/api/leave") {
  return new Request(path);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/leave — response shape contract", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(prisma.leave.findMany).mockResolvedValue([PRISMA_LEAVE_ROW] as never);
    vi.mocked(prisma.allocation.findMany).mockResolvedValue(PRISMA_ALLOC_ROWS as never);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CRITICAL CONTRACT TEST
  // This is the exact test that would have caught the approverName bug.
  // The bug: GET returned `approval.approver.name` (nested) but the client
  //          expected `approval.approverName` (flat string). After any
  //          approve/reject, refreshLeaves() used the GET shape, and
  //          `approverName` was undefined → popup showed raw cuid.
  // ══════════════════════════════════════════════════════════════════════════

  describe("approverName flattening (guards against nested-object leak)", () => {
    it("exposes approverName as a flat string, not undefined", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];

      const appr = (body[0].approvals as Record<string, unknown>[])[0];
      expect(appr.approverName).toBe("Jane Manager");
    });

    it("does NOT expose the raw nested approver object to the client", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];

      const appr = (body[0].approvals as Record<string, unknown>[])[0];
      // If this passes, the nested shape leaked through — the bug is back
      expect(appr).not.toHaveProperty("approver");
    });

    it("sets approverName to null when the user has no display name", async () => {
      // Simulate a user who was auto-created from RM import with no name set
      const rowNoName = {
        ...PRISMA_LEAVE_ROW,
        approvals: [{
          ...PRISMA_LEAVE_ROW.approvals[0],
          approver: { id: "pm1", name: null, email: "pm@folio3.com" },
        }],
      };
      vi.mocked(prisma.leave.findMany).mockResolvedValue([rowNoName] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      // approverName must be null — NOT the cuid "pm1"
      expect(appr.approverName).toBeNull();
    });

    it("sets approverName to null when the approver record has no user attached", async () => {
      const rowNoApprover = {
        ...PRISMA_LEAVE_ROW,
        approvals: [{
          ...PRISMA_LEAVE_ROW.approvals[0],
          approver: null, // approver user deleted from DB
        }],
      };
      vi.mocked(prisma.leave.findMany).mockResolvedValue([rowNoApprover] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      expect(appr.approverName).toBeNull();
    });
  });

  // ── approverEmail ────────────────────────────────────────────────────────

  describe("approverEmail field", () => {
    it("includes approverEmail so the UI can fall back to email when name is null", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];

      const appr = (body[0].approvals as Record<string, unknown>[])[0];
      expect(appr.approverEmail).toBe("jane@folio3.com");
    });

    it("sets approverEmail to null when approver has no email", async () => {
      const rowNoEmail = {
        ...PRISMA_LEAVE_ROW,
        approvals: [{
          ...PRISMA_LEAVE_ROW.approvals[0],
          approver: { id: "pm1", name: "Jane", email: null },
        }],
      };
      vi.mocked(prisma.leave.findMany).mockResolvedValue([rowNoEmail] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      expect(appr.approverEmail).toBeNull();
    });
  });

  // ── projectNames ─────────────────────────────────────────────────────────

  describe("projectNames per approval", () => {
    it("returns projects managed by the L1 approver that overlap the leave dates", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0]; // level 1, managerId = pm1

      const projectNames = appr.projectNames as string[];
      expect(projectNames).toContain("Project Alpha");
      expect(projectNames).toContain("Project Beta");
    });

    it("returns empty projectNames for the L2 approver (DO) who manages no projects for this user", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];

      // level 2 approver is do1 — not a managerId on any allocation
      const l2 = (body[0].approvals as Record<string, unknown>[]).find(
        (a) => a.level === 2
      );
      expect(l2!.projectNames).toEqual([]);
    });

    it("excludes allocations that end before the leave starts", async () => {
      vi.mocked(prisma.allocation.findMany).mockResolvedValue([
        {
          userId:    "user1",
          startDate: new Date("2026-04-01T00:00:00Z"),
          endDate:   new Date("2026-05-31T00:00:00Z"), // ends before leave Jun 1–5
          project:   { id: "proj3", name: "Past Project", managerId: "pm1" },
        },
      ] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      expect(appr.projectNames as string[]).not.toContain("Past Project");
      expect((appr.projectNames as string[])).toHaveLength(0);
    });

    it("excludes allocations that start after the leave ends", async () => {
      vi.mocked(prisma.allocation.findMany).mockResolvedValue([
        {
          userId:    "user1",
          startDate: new Date("2026-06-06T00:00:00Z"), // starts after leave ends Jun 5
          endDate:   new Date("2026-06-30T00:00:00Z"),
          project:   { id: "proj4", name: "Future Project", managerId: "pm1" },
        },
      ] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      expect((appr.projectNames as string[])).toHaveLength(0);
    });

    it("deduplicates project names when the same project appears in multiple allocations", async () => {
      vi.mocked(prisma.allocation.findMany).mockResolvedValue([
        {
          userId:    "user1",
          startDate: new Date("2026-05-01T00:00:00Z"),
          endDate:   new Date("2026-06-15T00:00:00Z"),
          project:   { id: "proj1", name: "Project Alpha", managerId: "pm1" },
        },
        {
          userId:    "user1",
          startDate: new Date("2026-06-01T00:00:00Z"),
          endDate:   new Date("2026-06-30T00:00:00Z"),
          // same name, same project — should appear only once
          project:   { id: "proj1", name: "Project Alpha", managerId: "pm1" },
        },
      ] as never);

      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      const names = appr.projectNames as string[];
      expect(names.filter((n) => n === "Project Alpha")).toHaveLength(1);
    });
  });

  // ── Date serialization ────────────────────────────────────────────────────

  describe("date serialization", () => {
    it("serializes approval createdAt to an ISO string", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>[];
      const appr = (body[0].approvals as Record<string, unknown>[])[0];

      expect(typeof appr.createdAt).toBe("string");
      // Must parse as a valid date
      expect(Number.isNaN(Date.parse(appr.createdAt as string))).toBe(false);
    });

    it("does NOT expose a Date object (which would JSON.stringify to a string anyway but should be explicit)", async () => {
      const res  = await GET(makeRequest());
      // Response.json() gives us parsed JSON — if it was a Date object inside
      // the handler, it would have been serialized as a string by JSON.stringify.
      // This test confirms the client never receives a raw Date.
      const text = await res.text();
      const body = JSON.parse(text) as Record<string, unknown>[];

      const appr = (body[0].approvals as Record<string, unknown>[])[0];
      // typeof must be string, not object (which a Date would be before stringify)
      expect(typeof appr.createdAt).toBe("string");
    });
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe("authentication guard", () => {
    it("returns 401 when there is no session", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 200 with a JSON array for an authenticated admin", async () => {
      const res  = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

    it("returns an empty array (not an error) when there are no leave records", async () => {
      vi.mocked(prisma.leave.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.allocation.findMany).mockResolvedValue([] as never);

      const res  = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });
  });
});

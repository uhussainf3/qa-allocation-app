/**
 * Integration tests for the ADMIN "Danger Zone" full data reset.
 *
 * GET  /api/admin/reset — dry-run counts (response contract + auth guards)
 * POST /api/admin/reset — destructive reset, gated by an exact confirmation
 *                          phrase; asserts the transaction touches every
 *                          table and that the calling admin's own User row
 *                          is excluded from deletion.
 *
 * Prisma query shapes / transaction ordering are not exercised against a
 * real DB here — that is integration-test territory per CODEBASE_RULES §9d.
 * This suite mocks Prisma and focuses on the response contract and the
 * guard logic (auth, role, confirmation phrase, self-preservation).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

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
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

function countersAndDeletes() {
  return { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division:               { ...countersAndDeletes(), findMany: vi.fn().mockResolvedValue([]) },
    project:                { ...countersAndDeletes(), findMany: vi.fn().mockResolvedValue([]) },
    user:                   { ...countersAndDeletes(), findMany: vi.fn().mockResolvedValue([]) },
    allocation:             countersAndDeletes(),
    allocationBatch:        countersAndDeletes(),
    leave:                  countersAndDeletes(),
    leaveApproval:          countersAndDeletes(),
    hoursLog:               countersAndDeletes(),
    timesheet:              countersAndDeletes(),
    task:                   { ...countersAndDeletes(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    resourceRequest:        countersAndDeletes(),
    userSkill:              countersAndDeletes(),
    notification:           countersAndDeletes(),
    notificationPreference: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog:               countersAndDeletes(),
    pipeline:               countersAndDeletes(),
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
      // The route passes `tx` (the same prisma client shape) to the callback.
      const { prisma } = await import("@/lib/prisma");
      await cb(prisma);
    }),
  },
}));

import { GET, POST } from "@/app/api/admin/reset/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { RESET_CONFIRM_PHRASE } from "@/lib/resetUtils";

const ADMIN_SESSION  = { user: { id: "admin1",  role: "ADMIN"  } };
const MEMBER_SESSION = { user: { id: "member1", role: "MEMBER" } };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/reset", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    vi.mocked(auth).mockResolvedValue(MEMBER_SESSION as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns counts for every tracked table and excludes the caller from the user count", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.counts).toEqual({
      divisions: 0,
      projects: 0,
      users: 0,
      allocations: 0,
      allocationBatches: 0,
      leaves: 0,
      leaveApprovals: 0,
      hoursLogs: 0,
      timesheets: 0,
      tasks: 0,
      resourceRequests: 0,
      userSkills: 0,
      notifications: 0,
      auditLogs: 0,
      pipeline: 0,
    });

    // The "users" count and the user-details list must both exclude the caller.
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { id: { not: "admin1" } } });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { not: "admin1" } } })
    );

    expect(body.confirmPhrase).toBe(RESET_CONFIRM_PHRASE);
    expect(Array.isArray(body.divisionDetails)).toBe(true);
    expect(Array.isArray(body.projectDetails)).toBe(true);
    expect(Array.isArray(body.userDetails)).toBe(true);
  });
});

describe("POST /api/admin/reset", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(postRequest({ confirm: RESET_CONFIRM_PHRASE }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    vi.mocked(auth).mockResolvedValue(MEMBER_SESSION as never);
    const res = await POST(postRequest({ confirm: RESET_CONFIRM_PHRASE }));
    expect(res.status).toBe(403);
  });

  it("rejects when the confirmation phrase is missing or wrong, without touching the DB", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);

    const resMissing = await POST(postRequest({}));
    expect(resMissing.status).toBe(400);

    const resWrong = await POST(postRequest({ confirm: "delete all data" }));
    expect(resWrong.status).toBe(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("runs the reset transaction, preserves the caller's own user row, and revalidates tags", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);

    const res = await POST(postRequest({ confirm: RESET_CONFIRM_PHRASE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Every dependent table is cleared...
    expect(prisma.leaveApproval.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.leave.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.userSkill.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.resourceRequest.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.hoursLog.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.timesheet.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.allocation.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.allocationBatch.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ data: { parentId: null }, where: {} });
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.pipeline.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.project.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.division.deleteMany).toHaveBeenCalledWith({});

    // ...and the caller's own user/notification-preference rows are preserved.
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: { not: "admin1" } } });
    expect(prisma.notificationPreference.deleteMany).toHaveBeenCalledWith({ where: { userId: { not: "admin1" } } });

    // Affected caches are invalidated.
    expect(revalidateTag).toHaveBeenCalledWith("users", "max");
    expect(revalidateTag).toHaveBeenCalledWith("allocations", "max");
    expect(revalidateTag).toHaveBeenCalledWith("projects", "max");
    expect(revalidateTag).toHaveBeenCalledWith("divisions", "max");
    expect(revalidateTag).toHaveBeenCalledWith("leaves", "max");
  });
});

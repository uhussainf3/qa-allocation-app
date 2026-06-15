/**
 * Integration tests for POST /api/divisions/[id]/merge
 *
 * Reassigns all Users and Projects from a source division to a target
 * division (e.g. merging duplicate "NS" / "NETSUI" NetSuite divisions).
 * Prisma query shapes are mocked; this asserts the auth/role guards,
 * validation (self-merge, missing target, unknown division), and the
 * response/cache-invalidation contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/apiResponse", () => ({
  ok: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  err: (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } }),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } }),
  notFound: () =>
    new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUnique: vi.fn() },
    user:     { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    project:  { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import("@/lib/prisma");
      return cb(prisma);
    }),
  },
}));

import { POST } from "@/app/api/divisions/[id]/merge/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";

const ADMIN_SESSION  = { user: { id: "admin1",  role: "ADMIN"  } };
const MEMBER_SESSION = { user: { id: "member1", role: "MEMBER" } };

const NS     = { id: "ns",     code: "NS",     name: "NetSuite (old)" };
const NETSUI = { id: "netsui", code: "NETSUI", name: "NetSuite" };

function postRequest(targetId: unknown) {
  return new Request("http://localhost/api/divisions/ns/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
}

function params(id = "ns") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/divisions/[id]/merge", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(postRequest("netsui"), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    vi.mocked(auth).mockResolvedValue(MEMBER_SESSION as never);
    const res = await POST(postRequest("netsui"), params());
    expect(res.status).toBe(403);
  });

  it("rejects merging a division into itself without touching the DB", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    const res = await POST(postRequest("ns"), params("ns"));
    expect(res.status).toBe(400);
    expect(prisma.division.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when targetId is missing", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    const res = await POST(postRequest(undefined), params("ns"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the source division does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(prisma.division.findUnique).mockResolvedValueOnce(null);
    const res = await POST(postRequest("netsui"), params("ns"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the target division does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(prisma.division.findUnique)
      .mockResolvedValueOnce(NS as never)   // source lookup
      .mockResolvedValueOnce(null);          // target lookup
    const res = await POST(postRequest("netsui"), params("ns"));
    expect(res.status).toBe(404);
  });

  it("reassigns all users and projects from source to target, then invalidates caches", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(prisma.division.findUnique)
      .mockResolvedValueOnce(NS as never)
      .mockResolvedValueOnce(NETSUI as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({ count: 7 });
    vi.mocked(prisma.project.updateMany).mockResolvedValueOnce({ count: 3 });

    const res = await POST(postRequest("netsui"), params("ns"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { divisionId: "ns" },
      data:  { divisionId: "netsui" },
    });
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: { divisionId: "ns" },
      data:  { divisionId: "netsui" },
    });

    expect(body).toEqual({
      success: true,
      source: { id: "ns", code: "NS", name: "NetSuite (old)" },
      target: { id: "netsui", code: "NETSUI", name: "NetSuite" },
      usersMoved: 7,
      projectsMoved: 3,
    });

    expect(revalidateTag).toHaveBeenCalledWith("users", "max");
    expect(revalidateTag).toHaveBeenCalledWith("projects", "max");
    expect(revalidateTag).toHaveBeenCalledWith("divisions", "max");
  });
});

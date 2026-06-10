import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z }             from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  type:          z.enum(["PTO", "SICK", "TRAINING", "PUBLIC_HOLIDAY", "UNPAID"]),
  startDate:     z.string(),
  endDate:       z.string(),
  reason:        z.string().optional(),
  clientApproval: z.string().optional(),
  backupPlan:    z.string().optional(),
});

const reviewSchema = z.object({
  leaveId:  z.string(),
  action:   z.enum(["approve", "reject", "update_fields"]),
  comment:  z.string().optional(),
  clientApproval: z.string().optional(),
  backupPlan:     z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createNotification(
  userId: string, title: string, message: string, link = "/leave"
) {
  try {
    await prisma.notification.create({
      data: { userId, type: "LEAVE_REQUEST", title, message, link },
    });
  } catch { /* non-critical */ }
}

// ─── GET /api/leave ───────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId   = searchParams.get("userId");
  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(
    session.user.role
  );

  const where = canSeeAll
    ? userId ? { userId } : {}
    : {
        OR: [
          { userId: session.user.id },
          { approvals: { some: { approverId: session.user.id } } },
        ],
      };

  const leaves = await prisma.leave.findMany({
    where,
    include: {
      user:     { select: { id: true, name: true, email: true, image: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Fetch overlapping allocations for all leave users so we can show project
  // names next to each PM in the approval chain
  const leaveUserIds = [...new Set(leaves.map((l) => l.userId))];
  const allAllocations = leaveUserIds.length > 0
    ? await prisma.allocation.findMany({
        where: { userId: { in: leaveUserIds } },
        select: {
          userId:    true,
          startDate: true,
          endDate:   true,
          project:   { select: { id: true, name: true, managerId: true } },
        },
      })
    : [];

  function mgrProjectMap(userId: string, lStart: Date, lEnd: Date): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const a of allAllocations) {
      if (a.userId !== userId)  continue;
      if (a.startDate > lEnd)   continue;
      if (a.endDate   < lStart) continue;
      const mid = a.project.managerId;
      if (!mid) continue;
      if (!map[mid]) map[mid] = [];
      if (!map[mid].includes(a.project.name)) map[mid].push(a.project.name);
    }
    return map;
  }

  // Normalize to the same flat shape the client component expects —
  // mirrors leave/page.tsx exactly so SSR and refresh are always identical
  return ok(leaves.map((l) => {
    const mgr2proj = mgrProjectMap(l.userId, l.startDate, l.endDate);
    return {
      ...l,
      approvals: l.approvals.map((a) => ({
        id:            a.id,
        approverId:    a.approverId,
        approverName:  a.approver?.name  ?? null,
        approverEmail: a.approver?.email ?? null,
        projectNames:  mgr2proj[a.approverId] ?? [],
        level:         a.level,
        status:        a.status,
        comment:       a.comment,
        createdAt:     a.createdAt.toISOString(),
      })),
    };
  }));
}

// ─── POST /api/leave ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const leaveStart = new Date(parsed.data.startDate);
  const leaveEnd   = new Date(parsed.data.endDate);

  // ── Create the leave record ────────────────────────────────────────────────
  const leave = await prisma.leave.create({
    data: {
      userId:         session.user.id,
      type:           parsed.data.type,
      startDate:      leaveStart,
      endDate:        leaveEnd,
      reason:         parsed.data.reason,
      clientApproval: parsed.data.clientApproval,
      backupPlan:     parsed.data.backupPlan,
      status:         "PENDING",
    },
  });

  // ── Determine Level-1 approvers (PMs on active allocations) ───────────────
  const overlappingAllocations = await prisma.allocation.findMany({
    where: {
      userId:    session.user.id,
      startDate: { lte: leaveEnd },
      endDate:   { gte: leaveStart },
    },
    select: { project: { select: { managerId: true } } },
  });

  const pmIds = [
    ...new Set(
      overlappingAllocations
        .map((a) => a.project.managerId)
        .filter((id): id is string => !!id)
    ),
  ];

  // ── Fetch submitting user for fallbacks ───────────────────────────────────
  const submitter = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { managerId: true, divisionId: true, name: true },
  });

  // Fallback: no PM from allocations → use direct manager
  if (pmIds.length === 0 && submitter?.managerId) {
    pmIds.push(submitter.managerId);
  }

  // ── Determine Level-2 approver (Division Owner or Admin fallback) ─────────
  let divOwnerId: string | null = null;

  if (submitter?.divisionId) {
    const div = await prisma.division.findUnique({
      where:  { id: submitter.divisionId },
      select: { ownerId: true },
    });
    divOwnerId = div?.ownerId ?? null;
  }

  if (!divOwnerId) {
    const admin = await prisma.user.findFirst({
      where:   { role: "ADMIN", isActive: true },
      select:  { id: true },
      orderBy: { createdAt: "asc" },
    });
    divOwnerId = admin?.id ?? null;
  }

  // ── If no L1 approvers at all → Division Owner acts as sole approver ──────
  // (their single approval makes the leave APPROVED directly)
  const l1ApproverIds = pmIds.length > 0 ? pmIds : divOwnerId ? [divOwnerId] : [];

  // ── Create approval records ───────────────────────────────────────────────
  type ApprovalInput = { leaveId: string; approverId: string; level: number };
  const approvalData: ApprovalInput[] = [];

  for (const pmId of l1ApproverIds) {
    approvalData.push({ leaveId: leave.id, approverId: pmId, level: 1 });
  }

  // Add Level-2 approver only if they're different from the sole L1 approver
  // (avoid creating a redundant level-2 record when DO is the only approver)
  if (divOwnerId && !(l1ApproverIds.length === 1 && l1ApproverIds[0] === divOwnerId)) {
    approvalData.push({ leaveId: leave.id, approverId: divOwnerId, level: 2 });
  }

  if (approvalData.length > 0) {
    await prisma.leaveApproval.createMany({ data: approvalData, skipDuplicates: true });
  }

  // ── Notify Level-1 approvers immediately ─────────────────────────────────
  const submitterName = submitter?.name ?? "An employee";
  for (const pmId of l1ApproverIds) {
    await createNotification(
      pmId,
      "Leave approval required",
      `${submitterName} has requested ${parsed.data.type} leave from ${leaveStart.toLocaleDateString()} to ${leaveEnd.toLocaleDateString()}.`
    );
  }

  revalidateTag("leaves", "max" as never);
  return ok(leave, 201);
}

// ─── PATCH /api/leave ─────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body   = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const { leaveId, action, comment, clientApproval, backupPlan } = parsed.data;
  const actorId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  // ── Fetch the leave with its full approval chain ───────────────────────────
  const leave = await prisma.leave.findUnique({
    where:   { id: leaveId },
    include: {
      approvals: true,
      user:      { select: { id: true, name: true, divisionId: true } },
    },
  });
  if (!leave) return err("Leave not found", 404);

  // ── update_fields: employee or any approver can update text fields ─────────
  if (action === "update_fields") {
    const isApprover = leave.approvals.some((a) => a.approverId === actorId);
    if (!isAdmin && leave.userId !== actorId && !isApprover) {
      return err("Not authorised to update this leave", 403);
    }
    const updated = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        ...(clientApproval !== undefined && { clientApproval }),
        ...(backupPlan     !== undefined && { backupPlan }),
      },
    });
    revalidateTag("leaves", "max" as never);
    return ok(updated);
  }

  // ── approve / reject ───────────────────────────────────────────────────────

  // Find this actor's pending approval record
  const myApproval = leave.approvals.find(
    (a) => a.approverId === actorId && a.status === "PENDING"
  );

  if (!myApproval && !isAdmin) {
    return err("You are not a pending approver for this leave", 403);
  }

  // Update this approver's record (or admin acts directly)
  if (myApproval) {
    await prisma.leaveApproval.update({
      where: { id: myApproval.id },
      data: {
        status:  action === "approve" ? "APPROVED" : "REJECTED",
        comment: comment ?? null,
      },
    });
  }

  // Re-fetch approvals for fresh state
  const updatedApprovals = await prisma.leaveApproval.findMany({
    where: { leaveId },
  });

  const l1Approvals = updatedApprovals.filter((a) => a.level === 1);
  const l2Approval  = updatedApprovals.find((a)  => a.level === 2);
  const myLevel     = myApproval?.level ?? (isAdmin ? 2 : null);

  // ── Level-1 PM logic ───────────────────────────────────────────────────────
  if (myLevel === 1) {
    const allL1Approved = l1Approvals.every((a) => a.status === "APPROVED");
    const anyL1Rejected = l1Approvals.some((a)  => a.status === "REJECTED");

    if (allL1Approved) {
      // All PMs approved → move to PM_APPROVED, notify Level-2
      await prisma.leave.update({ where: { id: leaveId }, data: { status: "PM_APPROVED" } });

      if (l2Approval) {
        await createNotification(
          l2Approval.approverId,
          "Leave awaiting your final approval",
          `${leave.user.name ?? "An employee"}'s leave has been approved by all project managers and requires your final sign-off.`
        );
      } else {
        // No level-2 approver (DO was the sole L1 approver) → auto-approve
        await prisma.leave.update({
          where: { id: leaveId },
          data:  { status: "APPROVED", approvedBy: actorId },
        });
        await createNotification(
          leave.userId,
          "Leave approved",
          "Your leave request has been approved."
        );
      }
    } else if (anyL1Rejected && l2Approval) {
      // A PM rejected → escalate to DO immediately for final decision
      await createNotification(
        l2Approval.approverId,
        "Leave requires your decision",
        `A project manager has rejected ${leave.user.name ?? "an employee"}'s leave request. Your final decision is required.`
      );
    }
  }

  // ── Level-2 DO / Admin logic ───────────────────────────────────────────────
  if (myLevel === 2 || isAdmin) {
    if (action === "approve") {
      await prisma.leave.update({
        where: { id: leaveId },
        data:  { status: "APPROVED", approvedBy: actorId },
      });
      await createNotification(
        leave.userId,
        "Leave approved",
        "Your leave request has been approved by the division owner."
      );
    } else {
      await prisma.leave.update({
        where: { id: leaveId },
        data:  { status: "REJECTED", approvedBy: actorId },
      });
      await createNotification(
        leave.userId,
        "Leave rejected",
        `Your leave request has been rejected.${comment ? ` Reason: ${comment}` : ""}`
      );
    }
  }

  revalidateTag("leaves", "max" as never);
  return ok({ success: true });
}

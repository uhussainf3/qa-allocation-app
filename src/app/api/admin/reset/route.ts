import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, forbidden } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { isResetConfirmed, RESET_CONFIRM_PHRASE, type ResetCounts } from "@/lib/resetUtils";

// ADMIN-only "Danger Zone" full data reset.
//
// GET  — dry-run: returns counts of everything that WOULD be deleted, so the
//        admin can review before confirming (CODEBASE_RULES — always show a
//        dry run before a destructive operation of this kind).
// POST — performs the reset. Requires { confirm: "DELETE ALL DATA" } in the
//        body (see resetUtils.isResetConfirmed). Deletes every Division,
//        Project, Allocation/AllocationBatch and ALL Users except the
//        calling admin's own account, plus every dependent record (Leave,
//        HoursLog, Timesheet, Task, ResourceRequest, UserSkill,
//        Notification, AuditLog, Pipeline). Preserves: the admin's own
//        login/User row, JobTitle list, PublicHoliday list and the Skill
//        catalogue.

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const userId = session.user.id;

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const divisions         = await prisma.division.count();
  const projects          = await prisma.project.count();
  const users              = await prisma.user.count({ where: { id: { not: userId } } });
  const allocations        = await prisma.allocation.count();
  const allocationBatches  = await prisma.allocationBatch.count();
  const leaves             = await prisma.leave.count();
  const leaveApprovals     = await prisma.leaveApproval.count();
  const hoursLogs          = await prisma.hoursLog.count();
  const timesheets         = await prisma.timesheet.count();
  const tasks              = await prisma.task.count();
  const resourceRequests   = await prisma.resourceRequest.count();
  const userSkills         = await prisma.userSkill.count();
  const notifications      = await prisma.notification.count();
  const auditLogs          = await prisma.auditLog.count();
  const pipeline           = await prisma.pipeline.count();

  const counts: ResetCounts = {
    divisions, projects, users, allocations, allocationBatches,
    leaves, leaveApprovals, hoursLogs, timesheets, tasks,
    resourceRequests, userSkills, notifications, auditLogs, pipeline,
  };

  // A couple of "what am I about to delete" details to sanity-check.
  const divisionDetails = await prisma.division.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const projectDetails = await prisma.project.findMany({
    select: { id: true, name: true, code: true, status: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  const userDetails = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  return ok({ counts, divisionDetails, projectDetails, userDetails, confirmPhrase: RESET_CONFIRM_PHRASE });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const body = await req.json().catch(() => ({}));
  const confirm = (body as { confirm?: string }).confirm;
  if (!isResetConfirmed(confirm)) {
    return err(`Confirmation text does not match. Type "${RESET_CONFIRM_PHRASE}" exactly.`, 400);
  }

  const userId = session.user.id;

  // Single interactive transaction: holds one connection for the whole
  // operation (safe under connection_limit=1) and makes the wipe atomic —
  // either everything below succeeds, or nothing changes. Deletion order
  // respects every FK relation in prisma/schema.prisma (children before
  // parents); Account/Session rows for deleted users cascade automatically.
  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.deleteMany({});
    await tx.leave.deleteMany({});
    await tx.userSkill.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.notificationPreference.deleteMany({ where: { userId: { not: userId } } });
    await tx.resourceRequest.deleteMany({});
    await tx.hoursLog.deleteMany({});
    await tx.timesheet.deleteMany({});
    await tx.allocation.deleteMany({});
    await tx.allocationBatch.deleteMany({});
    // Null out self-referencing Task.parentId before bulk-deleting tasks so
    // the self-relation FK never blocks the deleteMany below.
    await tx.task.updateMany({ data: { parentId: null }, where: {} });
    await tx.task.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.pipeline.deleteMany({});
    await tx.project.deleteMany({});
    await tx.division.deleteMany({});
    await tx.user.deleteMany({ where: { id: { not: userId } } });
  }, { timeout: 30000 });

  revalidateTag("users", "max" as never);
  revalidateTag("allocations", "max" as never);
  revalidateTag("projects", "max" as never);
  revalidateTag("divisions", "max" as never);
  revalidateTag("leaves", "max" as never);

  return ok({ success: true });
}

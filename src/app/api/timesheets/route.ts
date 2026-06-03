import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { getMondayOf } from "@/lib/weeks";
import { z } from "zod";

const reviewSchema = z.object({
  timesheetId: z.string(),
  action: z.enum(["approve", "reject", "flag"]),
  reviewNote: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(session.user.role);

  const timesheets = await prisma.timesheet.findMany({
    where: {
      ...(canSeeAll ? {} : { userId: session.user.id }),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      hoursLogs: {
        include: {
          project: { select: { id: true, name: true, color: true } },
          task: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { weekStart: "desc" },
  });

  return ok(timesheets);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();
  const { weekStart } = body;
  const monday = getMondayOf(new Date(weekStart));

  const logs = await prisma.hoursLog.findMany({
    where: {
      userId: session.user.id,
      date: { gte: monday, lt: new Date(monday.getTime() + 7 * 86400000) },
      status: "DRAFT",
    },
  });

  if (logs.length === 0) return err("No draft hours to submit for this week");

  const totalHours = logs.reduce((s, l) => s + l.hours, 0);

  const timesheet = await prisma.timesheet.upsert({
    where: { userId_weekStart: { userId: session.user.id, weekStart: monday } },
    update: { totalHours, status: "SUBMITTED", submittedAt: new Date() },
    create: {
      userId: session.user.id,
      weekStart: monday,
      totalHours,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  await prisma.hoursLog.updateMany({
    where: { id: { in: logs.map((l) => l.id) } },
    data: { status: "SUBMITTED", timesheetId: timesheet.id },
  });

  return ok(timesheet, 201);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const statusMap = { approve: "APPROVED", reject: "REJECTED", flag: "FLAGGED" } as const;
  const newStatus = statusMap[parsed.data.action];

  const timesheet = await prisma.timesheet.update({
    where: { id: parsed.data.timesheetId },
    data: {
      status: newStatus,
      reviewNote: parsed.data.reviewNote,
      reviewedAt: new Date(),
      reviewedBy: session.user.id,
    },
  });

  await prisma.hoursLog.updateMany({
    where: { timesheetId: timesheet.id },
    data: { status: newStatus === "APPROVED" ? "APPROVED" : newStatus === "REJECTED" ? "REJECTED" : "SUBMITTED" },
  });

  return ok(timesheet);
}

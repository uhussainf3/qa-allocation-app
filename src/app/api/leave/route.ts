import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["PTO", "SICK", "TRAINING", "PUBLIC_HOLIDAY", "UNPAID"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

const reviewSchema = z.object({
  leaveId: z.string(),
  action: z.enum(["approve", "reject"]),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(session.user.role);

  const leaves = await prisma.leave.findMany({
    where: canSeeAll
      ? userId ? { userId } : {}
      : { userId: session.user.id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { startDate: "asc" },
  });

  return ok(leaves);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const leave = await prisma.leave.create({
    data: {
      userId: session.user.id,
      type: parsed.data.type,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      reason: parsed.data.reason,
      status: "PENDING",
    },
  });

  return ok(leave, 201);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const leave = await prisma.leave.update({
    where: { id: parsed.data.leaveId },
    data: {
      status: parsed.data.action === "approve" ? "APPROVED" : "REJECTED",
      approvedBy: session.user.id,
    },
  });

  return ok(leave);
}

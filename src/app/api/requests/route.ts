import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  skillsRequired: z.array(z.string()).optional(),
  hoursPerWeek: z.number().min(0),
  startDate: z.string().optional(),
  duration: z.number().int().min(1).optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

const reviewSchema = z.object({
  requestId: z.string(),
  action: z.enum(["approve", "decline"]),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const canSeeAll = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(session.user.role);

  const requests = await prisma.resourceRequest.findMany({
    where: {
      ...(canSeeAll ? {} : { requestedById: session.user.id }),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      project: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, name: true, email: true, image: true } },
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok(requests);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const request = await prisma.resourceRequest.create({
    data: {
      requestedById: session.user.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      skillsRequired: parsed.data.skillsRequired ? JSON.stringify(parsed.data.skillsRequired) : null,
      hoursPerWeek: parsed.data.hoursPerWeek,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      duration: parsed.data.duration,
      priority: parsed.data.priority,
    },
  });

  return ok(request, 201);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return err("Forbidden", 403);

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const request = await prisma.resourceRequest.update({
    where: { id: parsed.data.requestId },
    data: {
      status: parsed.data.action === "approve" ? "APPROVED" : "DECLINED",
      assignedToId: parsed.data.assignedToId,
      notes: parsed.data.notes,
    },
  });

  return ok(request);
}

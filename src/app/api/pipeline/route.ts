import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const schema = z.object({
  name:              z.string().min(1),
  clientName:        z.string().optional().nullable(),
  status:            z.enum(["LEAD","QUALIFIED","PROPOSAL","NEGOTIATION","WON","LOST"]).optional(),
  probability:       z.number().int().min(0).max(100).optional(),
  dealSize:          z.number().optional().nullable(),
  expectedStartDate: z.string().optional().nullable(),
  expectedEndDate:   z.string().optional().nullable(),
  requiredHeadcount: z.number().int().min(1).optional(),
  hoursPerWeek:      z.number().min(1).optional(),
  skillsRequired:    z.string().optional().nullable(),
  notes:             z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const items = await prisma.pipeline.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { probability: "desc" }, { createdAt: "desc" }],
  });

  return ok(items.map(serialize));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
    return err("Only admins and project managers can create pipeline items", 403);
  }

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const item = await prisma.pipeline.create({
    data: {
      ...parsed.data,
      expectedStartDate: parsed.data.expectedStartDate ? new Date(parsed.data.expectedStartDate) : null,
      expectedEndDate:   parsed.data.expectedEndDate   ? new Date(parsed.data.expectedEndDate)   : null,
    },
  });

  revalidateTag("pipeline", "max");
  return ok(serialize(item), 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(p: any) {
  return {
    ...p,
    expectedStartDate: p.expectedStartDate?.toISOString() ?? null,
    expectedEndDate:   p.expectedEndDate?.toISOString()   ?? null,
    createdAt:         p.createdAt.toISOString(),
    updatedAt:         p.updatedAt.toISOString(),
  };
}

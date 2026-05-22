import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const updateSchema = z.object({
  name:              z.string().min(1).optional(),
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

function canWrite(role: string) {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  const { id } = await params;

  const item = await prisma.pipeline.findUnique({ where: { id } });
  if (!item) return notFound();
  return ok(serialize(item));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!canWrite(session.user.role)) return forbidden();
  const { id } = await params;

  const item = await prisma.pipeline.findUnique({ where: { id } });
  if (!item) return notFound();

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const updated = await prisma.pipeline.update({
    where: { id },
    data: {
      ...parsed.data,
      expectedStartDate: parsed.data.expectedStartDate !== undefined
        ? (parsed.data.expectedStartDate ? new Date(parsed.data.expectedStartDate) : null)
        : undefined,
      expectedEndDate: parsed.data.expectedEndDate !== undefined
        ? (parsed.data.expectedEndDate ? new Date(parsed.data.expectedEndDate) : null)
        : undefined,
    },
  });

  revalidateTag("pipeline", "max");
  return ok(serialize(updated));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!canWrite(session.user.role)) return forbidden();
  const { id } = await params;

  const item = await prisma.pipeline.findUnique({ where: { id } });
  if (!item) return notFound();
  if (item.convertedProjectId) return err("Cannot delete a deal that has been converted to a project");

  await prisma.pipeline.delete({ where: { id } });
  revalidateTag("pipeline", "max");
  return ok({ deleted: true });
}

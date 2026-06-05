import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const updateSchema = z.object({
  name:       z.string().min(1).optional(),
  role:       z.enum(["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER", "MEMBER"]).optional(),
  jobTitle:   z.string().optional().nullable(),
  capacity:   z.number().int().min(1).max(60).optional(),
  department: z.string().optional().nullable(),
  divisionId: z.string().optional().nullable(),
  isActive:   z.boolean().optional(),
  isOnshore:  z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can update users", 403);

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return notFound();

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true, name: true, email: true, role: true,
      jobTitle: true, capacity: true, department: true,
      divisionId: true, isActive: true, isOnshore: true, createdAt: true,
      division: { select: { id: true, name: true, code: true, color: true } },
    },
  });

  revalidateTag("users", "max" as never);
  return ok(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can deactivate users", 403);

  const { id } = await params;

  // Soft-delete: set isActive = false
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.user.update({ where: { id }, data: { isActive: false } });
  revalidateTag("users", "max" as never);
  return ok({ deactivated: true });
}

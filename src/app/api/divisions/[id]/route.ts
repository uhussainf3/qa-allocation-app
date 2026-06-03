import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const updateSchema = z.object({
  name:        z.string().min(1).optional(),
  code:        z.string().min(1).max(10).toUpperCase().optional(),
  color:       z.string().optional(),
  description: z.string().optional().nullable(),
  ownerId:     z.string().optional().nullable(),
  isActive:    z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can update divisions", 403);

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const existing = await prisma.division.findUnique({ where: { id } });
  if (!existing) return notFound();

  // Check code uniqueness if changing
  if (parsed.data.code && parsed.data.code !== existing.code) {
    const clash = await prisma.division.findUnique({ where: { code: parsed.data.code } });
    if (clash) return err("A division with that code already exists", 409);
  }

  const division = await prisma.division.update({
    where: { id },
    data: parsed.data,
    include: {
      owner:  { select: { id: true, name: true, email: true } },
      _count: { select: { members: true, projects: true } },
    },
  });

  revalidateTag("divisions", "max" as never);
  return ok(division);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can delete divisions", 403);

  const { id } = await params;
  const existing = await prisma.division.findUnique({
    where: { id },
    include: { _count: { select: { members: true, projects: true } } },
  });
  if (!existing) return notFound();

  if (existing._count.members > 0 || existing._count.projects > 0) {
    return err("Cannot delete a division that has members or projects. Reassign them first.", 409);
  }

  await prisma.division.delete({ where: { id } });
  revalidateTag("divisions", "max" as never);
  return ok({ deleted: true });
}

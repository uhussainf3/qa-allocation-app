import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name:        z.string().min(1),
  code:        z.string().min(1).max(10).toUpperCase(),
  color:       z.string().optional(),
  description: z.string().optional(),
  ownerId:     z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const divisions = await prisma.division.findMany({
    include: {
      owner:    { select: { id: true, name: true, email: true } },
      _count:   { select: { members: true, projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return ok(divisions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can create divisions", 403);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const { name, code, color, description, ownerId } = parsed.data;

  const existing = await prisma.division.findUnique({ where: { code } });
  if (existing) return err("A division with that code already exists", 409);

  const division = await prisma.division.create({
    data: { name, code, color: color ?? "#6366f1", description, ownerId: ownerId || null },
  });

  revalidateTag("divisions", "max" as never);
  return ok(division, 201);
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { z } from "zod";

const updateRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "PROJECT_MANAGER", "MANAGEMENT", "QA_ENGINEER"]),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      capacity: true,
      department: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return ok(users);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can change roles", 403);

  const body = await req.json();
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const user = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
  });

  return ok(user);
}

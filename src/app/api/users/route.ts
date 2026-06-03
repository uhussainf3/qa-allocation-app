import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name:       z.string().min(1),
  email:      z.string().email(),
  role:       z.enum(["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER", "MEMBER"]).default("MEMBER"),
  jobTitle:   z.string().optional().nullable(),
  capacity:   z.number().int().min(1).max(60).default(40),
  department: z.string().optional().nullable(),
  divisionId: z.string().optional().nullable(),
  isActive:   z.boolean().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "true";
  const divisionId      = searchParams.get("divisionId");

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.isActive = true;
  if (divisionId)        where.divisionId = divisionId;

  const users = await prisma.user.findMany({
    where,
    select: {
      id:         true,
      name:       true,
      email:      true,
      image:      true,
      role:       true,
      jobTitle:   true,
      capacity:   true,
      department: true,
      isActive:   true,
      divisionId: true,
      createdAt:  true,
      division:   { select: { id: true, name: true, code: true, color: true } },
    },
    orderBy: { name: "asc" },
  });

  return ok(users);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can create users", 403);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const { name, email, role, jobTitle, capacity, department, divisionId, isActive } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return err("A user with that email already exists", 409);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      jobTitle:   jobTitle   ?? null,
      capacity:   capacity   ?? 40,
      department: department ?? null,
      divisionId: divisionId ?? null,
      isActive:   isActive   ?? true,
    },
    select: {
      id: true, name: true, email: true, role: true,
      jobTitle: true, capacity: true, department: true,
      divisionId: true, isActive: true, createdAt: true,
      division: { select: { id: true, name: true, code: true, color: true } },
    },
  });

  revalidateTag("users", "max" as never);
  return ok(user, 201);
}

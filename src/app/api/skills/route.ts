import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { z } from "zod";

const upsertSchema = z.object({
  userId: z.string(),
  skillId: z.string(),
  level: z.number().int().min(1).max(3),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const skills = await prisma.skill.findMany({ orderBy: { name: "asc" } });
  const userSkills = await prisma.userSkill.findMany({
    include: { user: { select: { id: true, name: true, email: true } }, skill: true },
  });

  return ok({ skills, userSkills });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();

  if (body.type === "create-skill") {
    const role = session.user.role;
    if (role !== "ADMIN") return err("Only admins can create skills", 403);
    const skill = await prisma.skill.create({
      data: { name: body.name, category: body.category },
    });
    return ok(skill, 201);
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  const userSkill = await prisma.userSkill.upsert({
    where: { userId_skillId: { userId: parsed.data.userId, skillId: parsed.data.skillId } },
    update: { level: parsed.data.level },
    create: parsed.data,
  });

  return ok(userSkill);
}

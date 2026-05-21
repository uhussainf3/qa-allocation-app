import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { z } from "zod";

const allocationRowSchema = z.object({
  userName:    z.string(),
  userEmail:   z.string().email(),
  projectCode: z.string(),
  startDate:   z.string(),
  endDate:     z.string(),
  hoursPerDay: z.number().min(0).max(24).default(8),
  notes:       z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN" && session.user.role !== "PROJECT_MANAGER") {
    return err("Forbidden", 403);
  }

  const body = await req.json();
  const { type, rows } = body;

  if (type !== "allocations") return err("Unsupported import type");
  if (!Array.isArray(rows)) return err("rows must be an array");

  const errors: { row: number; message: string }[] = [];
  const created: unknown[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = allocationRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({ row: i + 1, message: parsed.error.message });
      continue;
    }

    const { userEmail, projectCode, startDate, endDate, hoursPerDay, notes } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) { errors.push({ row: i + 1, message: `User not found: ${userEmail}` }); continue; }

    const project = await prisma.project.findUnique({ where: { code: projectCode } });
    if (!project) { errors.push({ row: i + 1, message: `Project not found: ${projectCode}` }); continue; }

    const start = new Date(startDate + "T00:00:00Z");
    const end   = new Date(endDate   + "T00:00:00Z");

    const allocation = await prisma.allocation.upsert({
      where:  { userId_projectId_startDate: { userId: user.id, projectId: project.id, startDate: start } },
      update: { endDate: end, hoursPerDay, notes },
      create: { userId: user.id, projectId: project.id, startDate: start, endDate: end, hoursPerDay, notes },
    });
    created.push(allocation);
  }

  return ok({ created: created.length, errors });
}

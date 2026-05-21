import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  name: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const rows = await prisma.publicHoliday.findMany({ orderBy: { date: "asc" } });
  return ok(rows.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can manage holidays", 403);

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);

  // Store at UTC midnight so date comparisons are consistent
  const date = new Date(parsed.data.date + "T00:00:00.000Z");

  try {
    const holiday = await prisma.publicHoliday.create({
      data: { date, name: parsed.data.name },
    });
    revalidateTag("holidays", "max");
    return ok({ holiday: { id: holiday.id, date: holiday.date.toISOString().slice(0, 10), name: holiday.name } });
  } catch {
    return err("A holiday already exists on that date", 409);
  }
}

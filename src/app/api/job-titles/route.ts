import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, forbidden } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// GET /api/job-titles — public to all authenticated users (needed for TeamClient dropdown)
export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const jobTitles = await prisma.jobTitle.findMany({ orderBy: { name: "asc" } });
  return ok(jobTitles);
}

// POST /api/job-titles — ADMIN only
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const { name } = await req.json();
  if (!name?.trim()) return err("Name is required");

  const trimmed = name.trim();

  // Check for duplicate
  const existing = await prisma.jobTitle.findUnique({ where: { name: trimmed } });
  if (existing) return err("A job title with this name already exists", 409);

  const jobTitle = await prisma.jobTitle.create({ data: { name: trimmed } });

  revalidateTag("job-titles", "max" as never);
  return ok({ jobTitle }, 201);
}

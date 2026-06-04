import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// PATCH /api/job-titles/[id] — rename a job title (ADMIN only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) return err("Name is required");

  const trimmed = name.trim();

  const existing = await prisma.jobTitle.findUnique({ where: { id } });
  if (!existing) return notFound();

  // Check duplicate (another record with the same name)
  const duplicate = await prisma.jobTitle.findFirst({
    where: { name: trimmed, NOT: { id } },
  });
  if (duplicate) return err("A job title with this name already exists", 409);

  // Update the name in all users that had the old name
  await prisma.user.updateMany({
    where: { jobTitle: existing.name },
    data:  { jobTitle: trimmed },
  });

  const updated = await prisma.jobTitle.update({
    where: { id },
    data:  { name: trimmed },
  });

  revalidateTag("job-titles", "max" as never);
  revalidateTag("users",      "max" as never);
  return ok({ jobTitle: updated });
}

// DELETE /api/job-titles/[id] — ADMIN only; blocked if any user currently has this title
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const { id } = await params;

  const jobTitle = await prisma.jobTitle.findUnique({ where: { id } });
  if (!jobTitle) return notFound();

  // Block deletion if any user is currently assigned this job title
  const inUseCount = await prisma.user.count({ where: { jobTitle: jobTitle.name } });
  if (inUseCount > 0) {
    return err(
      `Cannot delete — ${inUseCount} team member${inUseCount > 1 ? "s are" : " is"} currently assigned this job title.`,
      409
    );
  }

  await prisma.jobTitle.delete({ where: { id } });

  revalidateTag("job-titles", "max" as never);
  return ok({ success: true });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Only admins can manage holidays", 403);

  const { id } = await params;
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!holiday) return notFound();

  await prisma.publicHoliday.delete({ where: { id } });
  revalidateTag("holidays", "max");
  return ok({ success: true });
}

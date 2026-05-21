import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized } from "@/lib/apiResponse";

export async function GET() {
  const session = await auth();
  if (!session) return unauthorized();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok(notifications);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();

  const body = await req.json();
  const { id, markAllRead } = body;

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  } else if (id) {
    await prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  return ok({ success: true });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <NotificationsClient
      notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
    />
  );
}

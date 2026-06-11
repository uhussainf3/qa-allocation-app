import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCachedDivisions, getCachedAllUsers } from "@/lib/queries";
import { DivisionsClient } from "./DivisionsClient";

export const metadata = { title: "Divisions" };

export default async function DivisionsPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const divisions = await getCachedDivisions();
  const users     = await getCachedAllUsers();

  return (
    <DivisionsClient
      divisions={divisions}
      users={users.filter((u) => u.isActive)}
    />
  );
}

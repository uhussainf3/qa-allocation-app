import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCachedAllUsers, getCachedDivisions, getCachedJobTitles } from "@/lib/queries";
import { TeamClient } from "./TeamClient";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const users      = await getCachedAllUsers();
  const divisions  = await getCachedDivisions();
  const jobTitles  = await getCachedJobTitles();

  return (
    <TeamClient
      users={users}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}

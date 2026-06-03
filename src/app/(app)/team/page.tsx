import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCachedAllUsers, getCachedDivisions } from "@/lib/queries";
import { TeamClient } from "./TeamClient";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  const [users, divisions] = await Promise.all([
    getCachedAllUsers(),
    getCachedDivisions(),
  ]);

  return (
    <TeamClient
      users={users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      }))}
      divisions={divisions.map((d) => ({
        id:    d.id,
        name:  d.name,
        code:  d.code,
        color: d.color,
      }))}
    />
  );
}

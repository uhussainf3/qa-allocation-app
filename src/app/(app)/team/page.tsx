import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCachedAllUsers, getCachedDivisions, getCachedJobTitles } from "@/lib/queries";
import { TeamClient } from "./TeamClient";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  const [users, divisions, jobTitles] = await Promise.all([
    getCachedAllUsers(),
    getCachedDivisions(),
    getCachedJobTitles(),
  ]);

  return (
    <TeamClient
      users={users}
      divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}

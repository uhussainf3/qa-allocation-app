import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCachedDivisions, getCachedAllUsers } from "@/lib/queries";
import { DivisionsClient } from "./DivisionsClient";

export const metadata = { title: "Divisions" };

export default async function DivisionsPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  const [divisions, users] = await Promise.all([
    getCachedDivisions(),
    getCachedAllUsers(),
  ]);

  return (
    <DivisionsClient
      divisions={divisions.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }))}
      users={users.filter((u) => u.isActive)}
    />
  );
}

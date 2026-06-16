import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canViewExecutiveDashboard } from "@/lib/accessUtils";
import type { Role } from "@/types/enums";

export default async function Home() {
  const session = await auth();
  if (session && canViewExecutiveDashboard(session.user.role as Role, session.user.jobTitle)) {
    redirect("/dashboard");
  }
  redirect("/allocations");
}

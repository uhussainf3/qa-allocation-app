import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyTasksClient } from "./MyTasksClient";

export const metadata = { title: "My Tasks" };

export default async function MyTasksPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <MyTasksClient />;
}

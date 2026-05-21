import { auth } from "@/lib/auth";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  const session = await auth();
  const canImport = ["ADMIN", "PROJECT_MANAGER"].includes(session!.user.role);

  if (!canImport) {
    return <div className="page"><p style={{ padding: 40, color: "var(--text-muted)" }}>Access restricted to admins and project managers.</p></div>;
  }

  return <ImportClient />;
}

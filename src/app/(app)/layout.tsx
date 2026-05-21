import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Providers } from "@/components/providers";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <Providers>
      <div className="app has-sidebar">
        <Sidebar user={session.user} />
        <main className="main">{children}</main>
      </div>
    </Providers>
  );
}

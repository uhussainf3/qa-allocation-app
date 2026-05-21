import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginButton } from "./LoginButton";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/allocations");

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 8 }}>
          <span className="brand-mark" />
          <span style={{ fontSize: 20, fontWeight: 600 }}>QA Allocation</span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, textAlign: "center", marginBottom: 28 }}>
          Resource Allocation &amp; Capacity Management
        </p>
        <LoginButton />
        <p style={{ color: "var(--text-faint)", fontSize: 11.5, textAlign: "center", marginTop: 20 }}>
          Sign in with your official Google work account.
          <br />
          Contact your admin if you don&apos;t have access.
        </p>
      </div>
    </div>
  );
}

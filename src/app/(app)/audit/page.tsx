import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AuditPage() {
  const session = await auth();
  if (!["ADMIN", "PROJECT_MANAGER", "MANAGEMENT"].includes(session!.user.role)) {
    return <div className="page"><p style={{ padding: 40, color: "var(--text-muted)" }}>Access restricted.</p></div>;
  }

  const logs = await prisma.auditLog.findMany({
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const ACTION_COLOR: Record<string, string> = { created: "ok", updated: "warn", deleted: "bad" };

  return (
    <div className="page" data-screen-label="Activity log">
      <div className="page-head">
        <h1 className="page-title">Activity log</h1>
        <div className="page-sub">{logs.length} recent entries</div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 500, color: "var(--text-muted)" }}>When</th>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Who</th>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Action</th>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Target</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                <td style={{ padding: "10px 16px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: "10px 8px" }}>{l.actor?.name ?? "System"}</td>
                <td style={{ padding: "10px 8px" }}>
                  <span className={`chip chip-${ACTION_COLOR[l.action] ?? "idle"}`}>{l.action}</span>
                </td>
                <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>
                  {l.targetType} {l.targetId?.slice(0, 8)}
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

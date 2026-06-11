import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SkillsPage() {
  await auth();

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const users      = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const skills     = await prisma.skill.findMany({ orderBy: { name: "asc" } });
  const userSkills = await prisma.userSkill.findMany({ include: { skill: true } });

  const matrix: Record<string, Record<string, number>> = {};
  users.forEach((u) => { matrix[u.id] = {}; });
  userSkills.forEach((us) => { if (matrix[us.userId]) matrix[us.userId][us.skillId] = us.level; });

  const LEVEL_BG = ["transparent", "#dcfce7", "#86efac", "#16a34a"];
  const LEVEL_LABEL = ["—", "•", "••", "•••"];

  return (
    <div className="page" data-screen-label="Skill matrix">
      <div className="page-head">
        <h1 className="page-title">Skill matrix</h1>
        <div className="page-sub">{users.length} engineers · {skills.length} skills</div>
      </div>

      {skills.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          No skills configured yet. Ask an admin to add skills.
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)", minWidth: 160 }}>Engineer</th>
                {skills.map((s) => (
                  <th key={s.id} style={{ padding: "8px 6px", fontWeight: 500, color: "var(--text-muted)", textAlign: "center", minWidth: 80, writingMode: "vertical-lr", verticalAlign: "bottom", height: 80 }}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{u.name}</td>
                  {skills.map((s) => {
                    const level = matrix[u.id]?.[s.id] ?? 0;
                    return (
                      <td key={s.id} style={{ padding: "6px", textAlign: "center" }}>
                        <div style={{ background: LEVEL_BG[level], borderRadius: 4, padding: "4px 8px", fontSize: 13, fontWeight: 700, color: level ? "#166534" : "var(--text-faint)" }}>
                          {LEVEL_LABEL[level]}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ gap: 16, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
        <span>Legend:</span>
        {["—  Not rated", "•  Beginner", "••  Proficient", "•••  Expert"].map((l) => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}

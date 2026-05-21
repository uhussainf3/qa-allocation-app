import { auth } from "@/lib/auth";
import { getNextNWeeks, getMondayOf } from "@/lib/weeks";
import { getCachedSimpleUsers, getCachedConflictAllocations } from "@/lib/queries";

export default async function ConflictsPage() {
  await auth();
  const weeks = getNextNWeeks(4);
  const weekEnd = new Date(weeks[weeks.length - 1]);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [users, rawAllocations] = await Promise.all([
    getCachedSimpleUsers(),
    getCachedConflictAllocations(weeks[0].toISOString(), weekEnd.toISOString()),
  ]);

  // Convert ISO strings back to Date objects for server-side calculations
  const allocations = rawAllocations.map((a) => ({ ...a, startDate: new Date(a.startDate), endDate: new Date(a.endDate) }));

  type Conflict = {
    id: string; severity: string; engineer: string; week: string;
    allocated: number; capacity: number; project: string; description: string;
  };

  function workDaysInWeek(wMon: Date, aStart: Date, aEnd: Date): number {
    const wFri = new Date(wMon); wFri.setDate(wMon.getDate() + 4);
    const oS = aStart > wMon ? aStart : wMon;
    const oE = aEnd   < wFri ? aEnd   : wFri;
    if (oS > oE) return 0;
    let d = 0; const c = new Date(oS);
    while (c <= oE) { const dw = c.getDay(); if (dw >= 1 && dw <= 5) d++; c.setDate(c.getDate() + 1); }
    return d;
  }

  const conflicts: Conflict[] = [];
  users.forEach((u) => {
    weeks.forEach((w) => {
      const weekAllocs = allocations.filter((a) => a.userId === u.id && workDaysInWeek(w, a.startDate, a.endDate) > 0);
      const totalH = weekAllocs.reduce((s, a) => s + workDaysInWeek(w, a.startDate, a.endDate) * a.hoursPerDay, 0);
      const pct = u.capacity > 0 ? Math.round((totalH / u.capacity) * 100) : 0;
      if (pct > 100) {
        conflicts.push({
          id: `${u.id}-${w.toISOString()}`,
          severity: pct > 130 ? "HIGH" : pct > 110 ? "MEDIUM" : "LOW",
          engineer: u.name ?? "Unknown",
          week: w.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          allocated: totalH,
          capacity: u.capacity,
          project: weekAllocs.map((a) => a.project.name).join(", "),
          description: `${u.name} is allocated ${totalH}h against ${u.capacity}h capacity (${pct}%)`,
        });
      }
    });
  });

  const severity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  conflicts.forEach((c) => { severity[c.severity as keyof typeof severity]++; });

  return (
    <div className="page" data-screen-label="Conflicts">
      <div className="page-head">
        <h1 className="page-title">Conflicts</h1>
        <div className="page-sub">{conflicts.length} over-allocation{conflicts.length !== 1 ? "s" : ""} detected</div>
      </div>

      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className={`kpi ${severity.HIGH > 0 ? "bad" : ""}`}><div className="kpi-label">High severity</div><div className="kpi-value">{severity.HIGH}</div></div>
        <div className={`kpi ${severity.MEDIUM > 0 ? "warn" : ""}`}><div className="kpi-label">Medium severity</div><div className="kpi-value">{severity.MEDIUM}</div></div>
        <div className="kpi"><div className="kpi-label">Low severity</div><div className="kpi-value">{severity.LOW}</div></div>
        <div className="kpi ok"><div className="kpi-label">No conflicts</div><div className="kpi-value">{users.length - new Set(conflicts.map((c) => c.engineer)).size}</div><div className="kpi-meta">engineers</div></div>
      </div>

      {conflicts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--ok)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 600 }}>No over-allocations in the next 4 weeks</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {conflicts.map((c) => (
            <div key={c.id} className="card" style={{ borderLeft: `4px solid var(--${c.severity === "HIGH" ? "bad" : c.severity === "MEDIUM" ? "warn" : "ok"})` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{c.engineer} — {c.week}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{c.description}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Projects: {c.project}</div>
                </div>
                <span className={`chip chip-${c.severity === "HIGH" ? "bad" : c.severity === "MEDIUM" ? "warn" : "ok"}`}>
                  {c.severity}
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                Suggested: Reduce allocation on one project or move tasks to next week.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

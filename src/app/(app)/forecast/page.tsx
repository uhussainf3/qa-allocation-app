import { auth } from "@/lib/auth";
import { getNextNWeeks, getWeekLabel, getMondayOf } from "@/lib/weeks";
import { getCachedSimpleUsers, getCachedAllocationsMinimal } from "@/lib/queries";

export default async function ForecastPage() {
  await auth();
  const weeks90 = getNextNWeeks(13);
  const weekEnd = new Date(weeks90[weeks90.length - 1]);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [users, rawAllocations] = await Promise.all([
    getCachedSimpleUsers(),
    getCachedAllocationsMinimal(weeks90[0].toISOString(), weekEnd.toISOString()),
  ]);

  // Convert ISO strings back to Date objects for server-side calculations
  const allocations = rawAllocations.map((a) => ({ ...a, startDate: new Date(a.startDate), endDate: new Date(a.endDate) }));

  const totalCapacityPerWeek = users.reduce((s, u) => s + u.capacity, 0);

  function workDaysInWeek(wMon: Date, aStart: Date, aEnd: Date): number {
    const wFri = new Date(wMon); wFri.setDate(wMon.getDate() + 4);
    const oS = aStart > wMon ? aStart : wMon;
    const oE = aEnd   < wFri ? aEnd   : wFri;
    if (oS > oE) return 0;
    let d = 0; const c = new Date(oS);
    while (c <= oE) { const dw = c.getDay(); if (dw >= 1 && dw <= 5) d++; c.setDate(c.getDate() + 1); }
    return d;
  }

  const weeksData = weeks90.map((w, i) => {
    const demand = allocations.reduce((s, a) => s + workDaysInWeek(w, a.startDate, a.endDate) * a.hoursPerDay, 0);
    const utilPct = totalCapacityPerWeek > 0 ? Math.round((demand / totalCapacityPerWeek) * 100) : 0;
    return { label: getWeekLabel(w), demand, capacity: totalCapacityPerWeek, utilPct, period: i < 4 ? "30d" : i < 9 ? "60d" : "90d" };
  });

  const periods = [
    { label: "30 days", weeks: weeksData.slice(0, 4) },
    { label: "60 days", weeks: weeksData.slice(4, 9) },
    { label: "90 days", weeks: weeksData.slice(9, 13) },
  ];

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  return (
    <div className="page" data-screen-label="Forecast">
      <div className="page-head">
        <h1 className="page-title">Forecast</h1>
        <div className="page-sub">Demand vs capacity — 30, 60, 90 day view</div>
      </div>

      <div className="kpis" style={{ marginBottom: 24 }}>
        {periods.map((p) => {
          const avgPct = avg(p.weeks.map((w) => w.utilPct));
          return (
            <div key={p.label} className={`kpi ${avgPct > 100 ? "bad" : avgPct >= 90 ? "warn" : ""}`}>
              <div className="kpi-label">Avg utilisation · {p.label}</div>
              <div className="kpi-value">{avgPct}<span className="unit">%</span></div>
              <div className="kpi-meta">{avgPct > 100 ? "Over capacity" : avgPct >= 90 ? "Near capacity" : "Healthy"}</div>
            </div>
          );
        })}
        <div className="kpi">
          <div className="kpi-label">Team capacity / week</div>
          <div className="kpi-value">{totalCapacityPerWeek}<span className="unit">h</span></div>
          <div className="kpi-meta">{users.length} engineers</div>
        </div>
      </div>

      {periods.map((period) => (
        <div key={period.label} className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "var(--text)" }}>
            Next {period.label}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Week</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Demand</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Capacity</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Utilisation</th>
                <th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {period.weeks.map((w) => (
                <tr key={w.label} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "8px 8px" }}>{w.label}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{w.demand}h</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{w.capacity}h</td>
                  <td style={{ padding: "8px 8px", textAlign: "right" }}>
                    <span className={`chip chip-${w.utilPct > 100 ? "bad" : w.utilPct >= 90 ? "warn" : "ok"}`}>
                      {w.utilPct}%
                    </span>
                  </td>
                  <td style={{ padding: "8px 8px", width: 120 }}>
                    <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3 }}>
                      <div style={{ height: 6, borderRadius: 3, width: `${Math.min(100, w.utilPct)}%`, background: w.utilPct > 100 ? "var(--bad)" : w.utilPct >= 90 ? "var(--warn)" : "var(--ok)" }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

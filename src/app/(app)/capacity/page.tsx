import { auth } from "@/lib/auth";
import { getNextNWeeks, getWeekLabel, getMondayOf } from "@/lib/weeks";
import { getCachedSimpleUsers, getCachedAllocationsMinimal, getCachedApprovedLeaves } from "@/lib/queries";

export default async function CapacityPage() {
  await auth();
  const weeks = getNextNWeeks(12);
  const weekEnd = new Date(weeks[weeks.length - 1]);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const fromISO = weeks[0].toISOString();
  const toISO   = weekEnd.toISOString();

  const [users, rawAllocations, rawLeaves] = await Promise.all([
    getCachedSimpleUsers(),
    getCachedAllocationsMinimal(fromISO, toISO),
    getCachedApprovedLeaves(fromISO, toISO),
  ]);

  // Convert ISO strings back to Date objects for server-side calculations
  const allocations = rawAllocations.map((a) => ({ ...a, startDate: new Date(a.startDate), endDate: new Date(a.endDate) }));
  const leaves      = rawLeaves.map((l) => ({ ...l, startDate: new Date(l.startDate), endDate: new Date(l.endDate) }));

  function workDaysInWeek(wMon: Date, aStart: Date, aEnd: Date): number {
    const wFri = new Date(wMon); wFri.setDate(wMon.getDate() + 4);
    const oS = aStart > wMon ? aStart : wMon;
    const oE = aEnd   < wFri ? aEnd   : wFri;
    if (oS > oE) return 0;
    let d = 0; const c = new Date(oS);
    while (c <= oE) { const dw = c.getDay(); if (dw >= 1 && dw <= 5) d++; c.setDate(c.getDate() + 1); }
    return d;
  }

  function weekHours(userId: string, monday: Date) {
    return allocations
      .filter((a) => a.userId === userId)
      .reduce((s, a) => s + workDaysInWeek(monday, a.startDate, a.endDate) * a.hoursPerDay, 0);
  }

  function hasLeave(userId: string, monday: Date) {
    const fri = new Date(monday); fri.setDate(fri.getDate() + 4);
    return leaves.some((l) => l.userId === userId && new Date(l.startDate) <= fri && new Date(l.endDate) >= monday);
  }

  function heatLevel(pct: number) {
    if (pct === 0) return 0;
    if (pct < 25) return 1;
    if (pct < 50) return 2;
    if (pct < 75) return 3;
    if (pct < 90) return 4;
    if (pct <= 100) return 5;
    if (pct <= 120) return 6;
    return 7;
  }

  return (
    <div className="page" data-screen-label="Capacity">
      <div className="page-head">
        <h1 className="page-title">Capacity</h1>
        <div className="page-sub">12-week utilisation heatmap</div>
      </div>
      <div className="grid-wrap" style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 500, color: "var(--text-muted)", minWidth: 160 }}>Engineer</th>
              {weeks.map((w) => (
                <th key={w.toISOString()} style={{ padding: "6px 4px", fontWeight: 500, color: "var(--text-muted)", textAlign: "center", minWidth: 64 }}>
                  {getWeekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: "4px 12px", fontWeight: 500 }}>{u.name}</td>
                {weeks.map((w) => {
                  const h = weekHours(u.id, w);
                  const pct = u.capacity > 0 ? Math.round((h / u.capacity) * 100) : 0;
                  const lvl = heatLevel(pct);
                  const onLeave = hasLeave(u.id, w);
                  return (
                    <td key={w.toISOString()} style={{ padding: "3px 4px", textAlign: "center" }}>
                      <div
                        className={`heat-cell lvl-${lvl}${onLeave ? " leave" : ""}`}
                        title={`${h}h / ${u.capacity}h (${pct}%)`}
                        style={{ borderRadius: 4, padding: "4px 2px", fontSize: 11, fontFamily: "var(--mono)" }}
                      >
                        {h > 0 ? `${pct}%` : onLeave ? "⏸" : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 12, marginTop: 16, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
        {[0,1,2,3,4,5,6,7].map((lvl) => (
          <span key={lvl} className="row" style={{ gap: 6 }}>
            <span className={`heat-cell lvl-${lvl}`} style={{ width: 18, height: 18, display: "inline-block", borderRadius: 3 }} />
            {["0%","1–24%","25–49%","50–74%","75–89%","90–100%","101–120%",">120%"][lvl]}
          </span>
        ))}
      </div>
    </div>
  );
}

import { auth } from "@/lib/auth";
import { getNextNWeeks, getWeekLabel, workingDaysInWeek } from "@/lib/weeks";
import { getCachedSimpleUsers, getCachedAllocationsMinimal, getCachedPublicHolidays, getCachedDivisions } from "@/lib/queries";
import { Suspense } from "react";
import { DivisionFilter } from "@/components/DivisionFilter";
import { RoleFilter } from "@/components/RoleFilter";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string; role?: string }>;
}) {
  await auth();
  const { division: divisionId, role } = await searchParams;

  const weeks90 = getNextNWeeks(13);
  const weekEnd = new Date(weeks90[weeks90.length - 1]);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1"). Each of these is independently cached
  // (60s TTL) so steady-state requests don't hit the DB at all.
  const allUsers       = await getCachedSimpleUsers();
  const rawAllocations = await getCachedAllocationsMinimal(weeks90[0].toISOString(), weekEnd.toISOString());
  const rawHolidays    = await getCachedPublicHolidays();
  const divisions      = await getCachedDivisions();

  // Unique departments for RoleFilter dropdown (from all users, unfiltered)
  const departments = [...new Set(allUsers.flatMap((u) => u.department ? [u.department] : []))].sort();

  // Apply division filter then role filter
  const users = allUsers
    .filter((u) => !divisionId || u.divisionId === divisionId)
    .filter((u) => !role        || u.department === role);

  const allocations = rawAllocations.map((a) => ({ ...a, startDate: new Date(a.startDate), endDate: new Date(a.endDate) }));
  const holidays    = new Set(rawHolidays.map((h) => h.date));

  // Nominal (full-week) team capacity
  const totalCapacityPerWeek = users.reduce((s, u) => s + u.capacity, 0);

  function weekWorkingDays(monday: Date): number {
    let days = 0;
    for (let i = 0; i < 5; i++) {
      const cur = new Date(monday); cur.setDate(monday.getDate() + i);
      if (!holidays.has(cur.toISOString().slice(0, 10))) days++;
    }
    return days;
  }

  // Filter allocations to only visible users (always, since users may be filtered by division or role)
  const userIds = new Set(users.map((u) => u.id));
  const filteredAllocs = allocations.filter((a) => userIds.has(a.userId));

  const weeksData = weeks90.map((w, i) => {
    const demand  = Math.round(filteredAllocs.reduce((s, a) => s + workingDaysInWeek(w, a.startDate, a.endDate, holidays) * a.hoursPerDay, 0));
    const wDays   = weekWorkingDays(w);
    const weekCap = users.reduce((s, u) => s + u.capacity * wDays / 5, 0);
    const utilPct = weekCap > 0 ? Math.round((demand / weekCap) * 100) : 0;
    return { label: getWeekLabel(w), demand, capacity: Math.round(weekCap), utilPct, period: i < 4 ? "30d" : i < 9 ? "60d" : "90d" };
  });

  const periods = [
    { label: "30 days", weeks: weeksData.slice(0, 4) },
    { label: "60 days", weeks: weeksData.slice(4, 9) },
    { label: "90 days", weeks: weeksData.slice(9, 13) },
  ];

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const divisionsMeta = divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }));

  return (
    <div className="page" data-screen-label="Forecast">
      <div className="page-head">
        <div>
          <h1 className="page-title">Forecast</h1>
          <div className="page-sub">
            Demand vs capacity — 30, 60, 90 day view
            {divisionId && divisions.find((d) => d.id === divisionId) && ` · ${divisions.find((d) => d.id === divisionId)!.name}`}
            {role && ` · ${role}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Suspense>
            <DivisionFilter divisions={divisionsMeta} value={divisionId ?? ""} />
          </Suspense>
          {departments.length > 0 && (
            <Suspense>
              <RoleFilter roles={departments} value={role ?? ""} />
            </Suspense>
          )}
        </div>
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

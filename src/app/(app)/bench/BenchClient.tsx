"use client";

import { useRouter } from "next/navigation";

type BenchUser = {
  id: string;
  name: string | null;
  email: string | null;
  capacity: number;
  role: string;
  allocated: number;
  free: number;
  utilPct: number;
  totalCapacity: number;
};

interface Props {
  bench: BenchUser[];
  fromDate: string;
  toDate: string;
  weekCount: number;
}

export function BenchClient({ bench, fromDate, toDate, weekCount }: Props) {
  const router = useRouter();

  const totalFree = bench.reduce((s, u) => s + u.free, 0);
  const fullyAvailable = bench.filter((u) => u.utilPct === 0).length;
  const avgUtil =
    bench.length > 0
      ? Math.round(bench.reduce((s, u) => s + u.utilPct, 0) / bench.length)
      : 0;

  function handleFromChange(val: string) {
    const from = toMonday(val);
    const to = toDate < from ? from : toDate;
    router.push(`?from=${from}&to=${to}`);
  }

  function handleToChange(val: string) {
    const to = toMonday(val);
    const from = to < fromDate ? to : fromDate;
    router.push(`?from=${from}&to=${to}`);
  }

  return (
    <div className="page" data-screen-label="Bench">
      <div className="page-head">
        <div>
          <h1 className="page-title">Bench</h1>
          <div className="page-sub">
            {weekCount === 1 ? "This week" : `${weekCount} weeks`} &middot; {bench.length} engineers
          </div>
        </div>
      </div>

      {/* Date range filter */}
      <div className="card" style={{ marginBottom: 20, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, minWidth: 100 }}>
            Date range
          </div>
          <label className="field" style={{ margin: 0, minWidth: 160 }}>
            <span>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFromChange(e.target.value)}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
              {fmtWeek(fromDate)}
            </span>
          </label>
          <label className="field" style={{ margin: 0, minWidth: 160 }}>
            <span>To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => handleToChange(e.target.value)}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
              {fmtWeek(toDate)}
            </span>
          </label>
          <div style={{ fontSize: 12, color: "var(--text-muted)", paddingBottom: 22 }}>
            {weekCount} {weekCount === 1 ? "week" : "weeks"} selected
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-label">Total free hours</div>
          <div className="kpi-value">{totalFree}<span className="unit">h</span></div>
          <div className="kpi-meta">Across {weekCount} {weekCount === 1 ? "week" : "weeks"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fully available</div>
          <div className="kpi-value">{fullyAvailable}<span className="unit">engineers</span></div>
          <div className="kpi-meta">0% allocated</div>
        </div>
        <div className={`kpi ${avgUtil > 90 ? "warn" : ""}`}>
          <div className="kpi-label">Avg utilisation</div>
          <div className="kpi-value">{avgUtil}<span className="unit">%</span></div>
          <div className="kpi-meta">Team average</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total engineers</div>
          <div className="kpi-value">{bench.length}</div>
          <div className="kpi-meta">Active</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Engineer</th>
              <th style={{ textAlign: "right", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Capacity</th>
              <th style={{ textAlign: "right", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Allocated</th>
              <th style={{ textAlign: "right", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Free</th>
              <th style={{ padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {bench.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                <td style={{ padding: "10px 8px" }}>
                  <div style={{ fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.role.replace(/_/g, " ")}</div>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{u.totalCapacity}h</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{u.allocated}h</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600, color: u.free > 0 ? "var(--ok)" : "var(--text-muted)" }}>
                  {u.free}h
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3 }}>
                      <div style={{
                        height: 6, borderRadius: 3,
                        width: `${Math.min(100, u.utilPct)}%`,
                        background: u.utilPct > 100 ? "var(--bad)" : u.utilPct >= 90 ? "var(--warn)" : "var(--ok)"
                      }} />
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-secondary)", minWidth: 36 }}>
                      {u.utilPct}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {bench.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                  No engineers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helpers (client-side, no import needed)
function toMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const fri = new Date(d);
  fri.setDate(fri.getDate() + 4);
  const fmt = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(d)} - ${fmt(fri)}`;
}

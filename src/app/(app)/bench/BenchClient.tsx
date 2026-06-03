"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveAllocation = {
  projectId:    string;
  projectName:  string;
  projectColor: string;
  pct:          number;   // % of daily capacity used by this allocation
  endDate:      string;   // ISO
};

type BenchUser = {
  id:                 string;
  name:               string | null;
  email:              string | null;
  capacity:           number;
  role:               string;
  allocatedPct:       number;
  onBenchPct:         number;
  currentAllocations: ActiveAllocation[];
};

interface Props {
  bench: BenchUser[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name: string | null, email: string | null): string {
  return (name ?? email ?? "?")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function benchColor(pct: number): string {
  if (pct === 100) return "var(--ok)";
  if (pct >= 50)   return "var(--warn)";
  return "#f97316"; // orange — partially free
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BenchClient({ bench }: Props) {
  const fullyFree      = bench.filter((u) => u.onBenchPct === 100).length;
  const partialFree    = bench.filter((u) => u.onBenchPct > 0 && u.onBenchPct < 100).length;
  const totalFreeHours = Math.round(
    bench.reduce((s, u) => s + (u.capacity / 5) * (u.onBenchPct / 100), 0) * 10
  ) / 10;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page" data-screen-label="Bench">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Bench</h1>
          <div className="page-sub">As of {today} · {bench.length} resource{bench.length !== 1 ? "s" : ""} available</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi ok">
          <div className="kpi-label">Fully on bench</div>
          <div className="kpi-value">{fullyFree}<span className="unit">people</span></div>
          <div className="kpi-meta">100% available today</div>
        </div>
        <div className="kpi warn">
          <div className="kpi-label">Partially on bench</div>
          <div className="kpi-value">{partialFree}<span className="unit">people</span></div>
          <div className="kpi-meta">Some capacity free today</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total on bench</div>
          <div className="kpi-value">{bench.length}<span className="unit">people</span></div>
          <div className="kpi-meta">Not fully allocated</div>
        </div>
        <div className="kpi ok">
          <div className="kpi-label">Total free capacity</div>
          <div className="kpi-value">{totalFreeHours}<span className="unit">h / day</span></div>
          <div className="kpi-meta">Available across bench today</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        {bench.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            Everyone is fully allocated today.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left",   padding: "10px 16px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", width: "22%" }}>Resource</th>
                  <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", width: "18%" }}>On Bench</th>
                  <th style={{ textAlign: "left",   padding: "10px 16px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)"          }}>Current Allocations</th>
                </tr>
              </thead>
              <tbody>
                {bench.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: i < bench.length - 1 ? "1px solid var(--border)" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    {/* Resource */}
                    <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar" style={{ flexShrink: 0 }}>{initials(u.name, u.email)}</span>
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name ?? u.email}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            {u.role.replace(/_/g, " ")} · {u.capacity}h/wk
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* On Bench % */}
                    <td style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 90 }}>
                        <span style={{
                          fontSize: 20, fontWeight: 700,
                          color: benchColor(u.onBenchPct),
                        }}>
                          {u.onBenchPct}%
                        </span>
                        {/* Bar */}
                        <div style={{ width: 90, height: 5, background: "var(--surface-2)", borderRadius: 3 }}>
                          <div style={{
                            height: 5, borderRadius: 3,
                            width: `${u.onBenchPct}%`,
                            background: benchColor(u.onBenchPct),
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {u.onBenchPct === 100 ? "Fully free" : `${u.allocatedPct}% allocated`}
                        </span>
                      </div>
                    </td>

                    {/* Current Allocations */}
                    <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                      {u.currentAllocations.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No active allocations</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {u.currentAllocations.map((a) => (
                            <div
                              key={a.projectId + a.endDate}
                              style={{
                                display:      "inline-flex",
                                alignItems:   "center",
                                gap:          6,
                                padding:      "4px 10px",
                                borderRadius: 20,
                                background:   "var(--surface-2)",
                                border:       "1px solid var(--border)",
                                fontSize:     12,
                                whiteSpace:   "nowrap",
                              }}
                            >
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.projectColor, flexShrink: 0 }} />
                              <span style={{ fontWeight: 500 }}>{a.projectName}</span>
                              <span style={{ color: "var(--text-muted)" }}>·</span>
                              <span style={{ color: "var(--text-muted)" }}>{a.pct}%</span>
                              <span style={{ color: "var(--text-muted)" }}>·</span>
                              <span style={{ color: "var(--text-muted)" }}>ends {fmtDate(a.endDate)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} />
          100% free
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--warn)", display: "inline-block" }} />
          50–99% free
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
          1–49% free
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveAllocation = {
  projectId:    string;
  projectName:  string;
  projectColor: string;
  pct:          number;
  endDate:      string;
};

type BenchUser = {
  id:                 string;
  name:               string | null;
  email:              string | null;
  capacity:           number;
  role:               string;
  jobTitle:           string | null;
  department:         string | null;
  divisionId:         string | null;
  managerId:          string | null;
  allocatedPct:       number;
  onBenchPct:         number;
  currentAllocations: ActiveAllocation[];
};

type SimpleUser = {
  id:         string;
  name:       string | null;
  email:      string | null;
  capacity:   number;
  role:       string;
  jobTitle:   string | null;
  department: string | null;
  divisionId: string | null;
  managerId:  string | null;
};

type DivisionRef = { id: string; name: string; code: string; color: string };

interface Props {
  bench:     BenchUser[];
  bench30:   Record<string, number>;   // userId → onBenchPct at +30 days
  allUsers:  SimpleUser[];
  divisions: DivisionRef[];
}

type View = "detailed" | "simple" | "thirty";

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
  return "#f97316";
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function ResourceCell({ name, email, jobTitle, role, capacity }: {
  name: string | null; email: string | null;
  jobTitle: string | null; role: string; capacity: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="avatar" style={{ flexShrink: 0 }}>{initials(name, email)}</span>
      <div>
        <div style={{ fontWeight: 500 }}>{name ?? email}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
          {jobTitle ?? role.replace(/_/g, " ")} · {capacity}h/wk
        </div>
      </div>
    </div>
  );
}

function BenchBar({ pct }: { pct: number }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 90 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: benchColor(pct) }}>{pct}%</span>
      <div style={{ width: 90, height: 5, background: "var(--surface-2)", borderRadius: 3 }}>
        <div style={{ height: 5, borderRadius: 3, width: `${pct}%`, background: benchColor(pct) }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {pct === 100 ? "Fully free" : `${100 - pct}% allocated`}
      </span>
    </div>
  );
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontWeight: 500,
  fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em",
  color: "var(--text-muted)",
  background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function BenchClient({ bench, bench30, allUsers, divisions }: Props) {
  const [view,           setView]           = useState<View>("detailed");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [roleFilter,     setRoleFilter]     = useState("");
  const [pmFilter,       setPmFilter]       = useState("");

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // PM options — division owners and project managers (they appear as managers of resources)
  const pmOptions = useMemo(() =>
    allUsers
      .filter((u) => u.role === "PROJECT_MANAGER" || u.role === "DIVISION_OWNER")
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
  [allUsers]);

  // Unique role options (departments) from all bench users
  const roleOptions = useMemo(() => {
    const seen = new Set<string>();
    bench.forEach((u) => { if (u.department) seen.add(u.department); });
    return [...seen].sort();
  }, [bench]);

  // Apply all filters to today's bench
  const visibleBench = useMemo(
    () => bench.filter((u) => {
      if (divisionFilter && u.divisionId !== divisionFilter) return false;
      if (pmFilter       && u.managerId  !== pmFilter)       return false;
      if (roleFilter     && u.department  !== roleFilter)     return false;
      return true;
    }),
    [bench, divisionFilter, pmFilter, roleFilter]
  );

  // For 30-day view: all users who will have bench capacity at +30 days
  const bench30Users = useMemo(() => {
    const filtered = allUsers.filter((u) => {
      if (divisionFilter && u.divisionId !== divisionFilter) return false;
      if (pmFilter       && u.managerId  !== pmFilter)       return false;
      if (roleFilter     && u.department  !== roleFilter)     return false;
      return (bench30[u.id] ?? 0) > 0;
    });
    return filtered
      .map((u) => ({ ...u, onBenchPct: bench30[u.id] ?? 0 }))
      .sort((a, b) => b.onBenchPct - a.onBenchPct);
  }, [allUsers, bench30, divisionFilter, pmDivisionId, roleFilter]);

  // KPIs (today)
  const fullyFree      = visibleBench.filter((u) => u.onBenchPct === 100).length;
  const partialFree    = visibleBench.filter((u) => u.onBenchPct > 0 && u.onBenchPct < 100).length;
  const totalFreeHours = Math.round(
    visibleBench.reduce((s, u) => s + (u.capacity / 5) * (u.onBenchPct / 100), 0) * 10
  ) / 10;
  const sumBenchPct    = visibleBench.reduce((s, u) => s + u.onBenchPct, 0);

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCsv() {
    const isThirty = view === "thirty";
    const data     = isThirty ? bench30Users : visibleBench;
    const headers  = isThirty
      ? ["Name", "Role", "Department", "Bench % (in 30 days)"]
      : ["Name", "Role", "Department", "Bench %", "Allocated %", "Current Projects"];

    const rows = data.map((u) => {
      const name  = u.name ?? u.email ?? "";
      const role  = u.jobTitle ?? u.role.replace(/_/g, " ");
      const dept  = u.department ?? "";
      if (isThirty) {
        return [name, role, dept, String(u.onBenchPct)];
      }
      const bu         = u as BenchUser;
      const projects   = bu.currentAllocations?.map((a) => `${a.projectName} (${a.pct}%)`).join("; ") ?? "";
      return [name, role, dept, String(bu.onBenchPct), String(bu.allocatedPct), projects];
    });

    const csv   = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob  = new Blob([csv], { type: "text/csv" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href      = url;
    a.download  = `bench-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page" data-screen-label="Bench">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Bench</h1>
          <div className="page-sub">
            {view === "thirty"
              ? `In 30 days (${new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}) · ${bench30Users.length} resource${bench30Users.length !== 1 ? "s" : ""} available`
              : `As of ${today} · ${visibleBench.length} resource${visibleBench.length !== 1 ? "s" : ""} available`
            }
          </div>
        </div>
        <div className="page-actions">
          {divisions.length > 0 && (
            <select className="select-sm" value={divisionFilter} onChange={(e) => { setDivisionFilter(e.target.value); setPmFilter(""); setRoleFilter(""); }}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          )}
          {pmOptions.length > 0 && (
            <select className="select-sm" value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
              <option value="">All managers</option>
              {pmOptions.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
            </select>
          )}
          {roleOptions.length > 0 && (
            <select className="select-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <button className="btn" onClick={exportCsv} title="Export to CSV">↓ CSV</button>
          <div className="seg">
            <button className={view === "detailed" ? "active" : ""} onClick={() => setView("detailed")}>Detailed</button>
            <button className={view === "simple"   ? "active" : ""} onClick={() => setView("simple")}>Simple</button>
            <button className={view === "thirty"   ? "active" : ""} onClick={() => setView("thirty")}>+30 days</button>
          </div>
        </div>
      </div>

      {/* KPIs — only for today views */}
      {view !== "thirty" && (
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
            <div className="kpi-value">{visibleBench.length}<span className="unit">people</span></div>
            <div className="kpi-meta">Not fully allocated</div>
          </div>
          <div className="kpi ok">
            <div className="kpi-label">Total free capacity</div>
            <div className="kpi-value">{totalFreeHours}<span className="unit">h / day</span></div>
            <div className="kpi-meta">Available across bench today</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Sum of bench %</div>
            <div className="kpi-value">{sumBenchPct}<span className="unit">%</span></div>
            <div className="kpi-meta">Across {visibleBench.length} resource{visibleBench.length !== 1 ? "s" : ""} on bench</div>
          </div>
        </div>
      )}

      {/* ── Detailed view (current) ─────────────────────────────────────────── */}
      {view === "detailed" && (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          {visibleBench.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Everyone is fully allocated today.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH_STYLE, width: "22%" }}>Resource</th>
                    <th style={{ ...TH_STYLE, textAlign: "center", width: "16%" }}>On Bench</th>
                    <th style={{ ...TH_STYLE }}>Current Allocations</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBench.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{ borderBottom: i < visibleBench.length - 1 ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                        <ResourceCell {...u} />
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "center" }}>
                        <BenchBar pct={u.onBenchPct} />
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                        {u.currentAllocations.length === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No active allocations</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {u.currentAllocations.map((a) => (
                              <div
                                key={a.projectId + a.endDate}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "4px 10px", borderRadius: 20,
                                  background: "var(--surface-2)", border: "1px solid var(--border)",
                                  fontSize: 12, whiteSpace: "nowrap",
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
      )}

      {/* ── Simple view ─────────────────────────────────────────────────────── */}
      {view === "simple" && (
        <div className="card" style={{ overflow: "hidden", padding: 0, maxWidth: 680 }}>
          {visibleBench.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Everyone is fully allocated today.
            </div>
          ) : (
            visibleBench.map((u, i) => (
              <div
                key={u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
                  borderBottom: i < visibleBench.length - 1 ? "1px solid var(--border)" : "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ResourceCell {...u} />
                </div>
                <BenchBar pct={u.onBenchPct} />
              </div>
            ))
          )}
        </div>
      )}

      {/* ── +30-day view ─────────────────────────────────────────────────────── */}
      {view === "thirty" && (
        <div className="card" style={{ overflow: "hidden", padding: 0, maxWidth: 680 }}>
          {bench30Users.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Everyone will be fully allocated in 30 days.
            </div>
          ) : (
            bench30Users.map((u, i) => (
              <div
                key={u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
                  borderBottom: i < bench30Users.length - 1 ? "1px solid var(--border)" : "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ResourceCell {...u} />
                </div>
                <BenchBar pct={u.onBenchPct} />
              </div>
            ))
          )}
        </div>
      )}

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

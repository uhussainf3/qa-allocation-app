"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

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
type ProjectRef  = { id: string; name: string; code: string; color: string };

interface Props {
  bench:     BenchUser[];
  bench30:   Record<string, number>;   // userId → onBenchPct at +30 days
  bench60:   Record<string, number>;   // userId → onBenchPct at +60 days
  allUsers:  SimpleUser[];
  divisions: DivisionRef[];
  projects:  ProjectRef[];
  pmUserMap: Record<string, string[]>; // pmId → userIds with allocations on PM's projects
}

type View = "detailed" | "simple" | "thirty" | "sixty";

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

// ─── Add Allocation Modal ─────────────────────────────────────────────────────

interface AddAllocModalProps {
  user:      BenchUser | SimpleUser;
  projects:  ProjectRef[];
  onClose:   () => void;
  onSaved:   () => void;
}

function AddAllocModal({ user, projects, onClose, onSaved }: AddAllocModalProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyCap = user.capacity / 5;

  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate,   setEndDate]   = useState(todayStr);
  const [allocPct,  setAllocPct]  = useState(100);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const hoursPerDay = Math.round((allocPct / 100) * dailyCap * 10) / 10;

  async function handleSave() {
    if (!projectId)          { setError("Select a project."); return; }
    if (endDate < startDate) { setError("End date must be after start date."); return; }
    if (allocPct <= 0 || allocPct > 200) { setError("Allocation % must be between 1 and 200."); return; }

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, projectId, startDate, endDate, hoursPerDay }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Failed to save."); return; }
      onSaved();
      onClose();
    } catch { setError("Network error."); }
    finally   { setSaving(false); }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: 440, padding: 26, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Add Allocation</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
          Resource: <strong>{user.name ?? user.email}</strong> · {user.capacity}h/wk
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">
            <span>Project</span>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <span>Start date</span>
              <input className="input" type="date" value={startDate}
                onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
            </label>
            <label className="field">
              <span>End date</span>
              <input className="input" type="date" value={endDate} min={startDate}
                onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Allocation %</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="input" type="number" min={1} max={200} value={allocPct}
                onChange={(e) => setAllocPct(Number(e.target.value))} style={{ width: 100 }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>= {hoursPerDay}h/day</span>
            </div>
          </label>
        </div>

        {error && <div style={{ marginTop: 12, color: "var(--bad)", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Add Allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BenchClient({ bench, bench30, bench60, allUsers, divisions, projects, pmUserMap }: Props) {
  const router = useRouter();

  const [view,           setView]           = useState<View>("detailed");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [roleFilter,     setRoleFilter]     = useState("");
  const [pmFilter,       setPmFilter]       = useState("");
  const [allocTarget,    setAllocTarget]    = useState<BenchUser | SimpleUser | null>(null);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // PM options — division owners and project managers (they appear as managers of resources)
  const pmOptions = useMemo(() =>
    allUsers
      .filter((u) => u.role === "PROJECT_MANAGER" || u.role === "DIVISION_OWNER")
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
  [allUsers]);

  // Unique role options (departments) from all users (so filter works across all views)
  const roleOptions = useMemo(() => {
    const seen = new Set<string>();
    allUsers.forEach((u) => { if (u.department) seen.add(u.department); });
    return [...seen].sort();
  }, [allUsers]);

  // Apply all filters to today's bench
  const visibleBench = useMemo(() => {
    const pmUserIds = pmFilter ? new Set(pmUserMap[pmFilter] ?? []) : null;
    return bench.filter((u) => {
      if (divisionFilter && u.divisionId !== divisionFilter) return false;
      if (roleFilter     && u.department  !== roleFilter)    return false;
      if (pmUserIds      && !pmUserIds.has(u.id))            return false;
      return true;
    });
  }, [bench, pmUserMap, divisionFilter, pmFilter, roleFilter]);

  // For 30-day view: all users who will have bench capacity at +30 days
  const bench30Users = useMemo(() => {
    const pmUserIds = pmFilter ? new Set(pmUserMap[pmFilter] ?? []) : null;
    const filtered = allUsers.filter((u) => {
      if (divisionFilter && u.divisionId !== divisionFilter) return false;
      if (roleFilter     && u.department  !== roleFilter)    return false;
      if (pmUserIds      && !pmUserIds.has(u.id))            return false;
      return (bench30[u.id] ?? 0) > 0;
    });
    return filtered
      .map((u) => ({ ...u, onBenchPct: bench30[u.id] ?? 0 }))
      .sort((a, b) => b.onBenchPct - a.onBenchPct);
  }, [allUsers, bench30, pmUserMap, divisionFilter, pmFilter, roleFilter]);

  // For 60-day view: all users who will have bench capacity at +60 days
  const bench60Users = useMemo(() => {
    const pmUserIds = pmFilter ? new Set(pmUserMap[pmFilter] ?? []) : null;
    const filtered = allUsers.filter((u) => {
      if (divisionFilter && u.divisionId !== divisionFilter) return false;
      if (roleFilter     && u.department  !== roleFilter)    return false;
      if (pmUserIds      && !pmUserIds.has(u.id))            return false;
      return (bench60[u.id] ?? 0) > 0;
    });
    return filtered
      .map((u) => ({ ...u, onBenchPct: bench60[u.id] ?? 0 }))
      .sort((a, b) => b.onBenchPct - a.onBenchPct);
  }, [allUsers, bench60, pmUserMap, divisionFilter, pmFilter, roleFilter]);

  // KPIs (today)
  const fullyFree      = visibleBench.filter((u) => u.onBenchPct === 100).length;
  const partialFree    = visibleBench.filter((u) => u.onBenchPct > 0 && u.onBenchPct < 100).length;
  const totalFreeHours = Math.round(
    visibleBench.reduce((s, u) => s + (u.capacity / 5) * (u.onBenchPct / 100), 0) * 10
  ) / 10;
  const sumBenchPct    = visibleBench.reduce((s, u) => s + u.onBenchPct, 0);

  // Sum of bench % for snapshot views
  const sum30BenchPct  = bench30Users.reduce((s, u) => s + u.onBenchPct, 0);
  const sum60BenchPct  = bench60Users.reduce((s, u) => s + u.onBenchPct, 0);

  // Role tiles — resource count + sum of bench % per department
  const roleTiles = useMemo(() => {
    const src         = view === "thirty" ? bench30Users : view === "sixty" ? bench60Users : visibleBench;
    const countMap    = new Map<string, number>();
    const benchSumMap = new Map<string, number>();
    for (const u of src) {
      if (!u.department) continue;
      countMap.set(u.department,    (countMap.get(u.department)    ?? 0) + 1);
      benchSumMap.set(u.department, (benchSumMap.get(u.department) ?? 0) + u.onBenchPct);
    }
    return [...countMap.entries()]
      .map(([role, count]) => ({ role, count, sumBenchPct: benchSumMap.get(role) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [view, visibleBench, bench30Users, bench60Users]);

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCsv() {
    let headers: string[];
    let rows: string[][];

    if (view === "sixty") {
      headers = ["Name", "Role", "Department", "Bench % (in 60 days)"];
      rows = bench60Users.map((u) => [
        u.name ?? u.email ?? "",
        u.jobTitle ?? u.role.replace(/_/g, " "),
        u.department ?? "",
        String(u.onBenchPct),
      ]);
    } else if (view === "thirty") {
      headers = ["Name", "Role", "Department", "Bench % (in 30 days)"];
      rows = bench30Users.map((u) => [
        u.name ?? u.email ?? "",
        u.jobTitle ?? u.role.replace(/_/g, " "),
        u.department ?? "",
        String(u.onBenchPct),
      ]);
    } else if (view === "simple") {
      headers = ["Name", "Role", "Department", "Bench %"];
      rows = visibleBench.map((u) => [
        u.name ?? u.email ?? "",
        u.jobTitle ?? u.role.replace(/_/g, " "),
        u.department ?? "",
        String(u.onBenchPct),
      ]);
    } else {
      headers = ["Name", "Role", "Department", "Bench %", "Allocated %", "Current Projects"];
      rows = visibleBench.map((u) => {
        const projects = u.currentAllocations
          .map((a) => `${a.projectName} (${a.pct}%, ends ${fmtDate(a.endDate)})`)
          .join("; ");
        return [
          u.name ?? u.email ?? "",
          u.jobTitle ?? u.role.replace(/_/g, " "),
          u.department ?? "",
          String(u.onBenchPct),
          String(u.allocatedPct),
          projects,
        ];
      });
    }

    const csv  = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `bench-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
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
              : view === "sixty"
              ? `In 60 days (${new Date(Date.now() + 60 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}) · ${bench60Users.length} resource${bench60Users.length !== 1 ? "s" : ""} available`
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
            <button className={view === "sixty"    ? "active" : ""} onClick={() => setView("sixty")}>+60 days</button>
          </div>
        </div>
      </div>

      {/* KPIs — only for today views */}
      {view !== "thirty" && view !== "sixty" && (
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

      {/* ── Role tiles (all views) ───────────────────────────────────────────── */}
      {roleTiles.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {/* Total bench KPI for snapshot views */}
          {(view === "thirty" || view === "sixty") && (
            <div className="kpis" style={{ marginBottom: 14 }}>
              <div className="kpi">
                <div className="kpi-label">Total bench · {view === "thirty" ? "in 30 days" : "in 60 days"}</div>
                <div className="kpi-value">
                  {view === "thirty" ? bench30Users.length : bench60Users.length}
                  <span className="unit">people</span>
                </div>
                <div className="kpi-meta">
                  {new Date(Date.now() + (view === "thirty" ? 30 : 60) * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Sum of bench %</div>
                <div className="kpi-value">
                  {view === "thirty" ? sum30BenchPct : sum60BenchPct}
                  <span className="unit">%</span>
                </div>
                <div className="kpi-meta">
                  Across {view === "thirty" ? bench30Users.length : bench60Users.length} resource{(view === "thirty" ? bench30Users.length : bench60Users.length) !== 1 ? "s" : ""} on bench
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            By Role
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {roleTiles.map(({ role, count, sumBenchPct }) => (
              <div
                key={role}
                className="card"
                style={{ flex: "0 0 auto", minWidth: 120, padding: "12px 16px", textAlign: "center" }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ok)", marginTop: 5 }}>
                  {sumBenchPct}%
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{role}</div>
              </div>
            ))}
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
                    <th style={{ ...TH_STYLE, width: 1 }} />
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
                                  display: "inline-flex", flexDirection: "column",
                                  padding: "5px 10px", borderRadius: 10,
                                  background: "var(--surface-2)", border: "1px solid var(--border)",
                                  fontSize: 12, gap: 2,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.projectColor, flexShrink: 0 }} />
                                  <span style={{ fontWeight: 500 }}>{a.projectName}</span>
                                  <span style={{ color: "var(--text-muted)", marginLeft: 2 }}>{a.pct}%</span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 14 }}>
                                  ends {fmtDate(a.endDate)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        <button className="btn btn-sm" onClick={() => setAllocTarget(u)}>+ Allocate</button>
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
                <button className="btn btn-sm" onClick={() => setAllocTarget(u)}>+ Allocate</button>
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

      {/* ── +60-day view ─────────────────────────────────────────────────────── */}
      {view === "sixty" && (
        <div className="card" style={{ overflow: "hidden", padding: 0, maxWidth: 680 }}>
          {bench60Users.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Everyone will be fully allocated in 60 days.
            </div>
          ) : (
            bench60Users.map((u, i) => (
              <div
                key={u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
                  borderBottom: i < bench60Users.length - 1 ? "1px solid var(--border)" : "none",
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

      {/* Add Allocation Modal */}
      {allocTarget && (
        <AddAllocModal
          user={allocTarget}
          projects={projects}
          onClose={() => setAllocTarget(null)}
          onSaved={() => { setAllocTarget(null); router.refresh(); }}
        />
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

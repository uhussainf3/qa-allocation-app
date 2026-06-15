"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  filterUsers,
  computeUtilPct,
  computeBenchCount,
  computeActiveProjectCount,
  computeFilteredLeaveCount,
  filterEndingSoon,
  buildDivisionRoleStats,
  type DashboardUser,
  type DashboardAllocation,
  type DashboardActiveProject,
  type DashboardLeave,
} from "@/lib/dashboardUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DivisionStat = {
  id:           string;
  name:         string;
  code:         string;
  color:        string;
  isActive:     boolean;
  owner:        { id: string; name: string | null } | null;
  memberCount:  number;
  projectCount: number;
  utilPct:      number;
  headcount:    number;
};

type EndingSoon = {
  userName:    string;
  projectName: string;
  divisionId:  string | null;
  department:  string | null;
  endDate:     string;
};

type TopProject = {
  id:               string;
  name:             string;
  code:             string;
  color:            string;
  status:           string;
  divisionId:       string | null;
  managerName:      string | null;
  sanctionedHours:  number;
  hourlyRate:       number | null;
  hoursToDate:      number;
  allocatedHours:   number;
  contractedValue:  number;
  allocatedValue:   number;
  billedToDate:     number;
  departmentHours:  Record<string, number>;
  departmentAllocatedHours: Record<string, number>;
};

type PipelineItem = {
  id:                string;
  name:              string;
  status:            string;
  probability:       number;
  dealSize:          number | null;
  requiredHeadcount: number;
  hoursPerWeek:      number;
  expectedStartDate: string | null;
};

interface Props {
  todayISO:           string;
  pipelineCount:      number;
  users:              DashboardUser[];
  allocations:        DashboardAllocation[];
  activeProjects:     DashboardActiveProject[];
  leaves:             DashboardLeave[];
  divStats:           DivisionStat[];
  topProjects:        TopProject[];
  departments:        string[];
  endingSoon:         EndingSoon[];
  pipeline:           PipelineItem[];
  allDivisions:       { id: string; name: string; code: string; color: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function utilColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "var(--ok)";
  if (pct >= 40) return "var(--warn)";
  return "#f97316";
}

const PIPELINE_LABELS: Record<string, string> = {
  LEAD: "Lead", QUALIFIED: "Qualified", PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardClient({
  todayISO, pipelineCount,
  users, allocations, activeProjects, leaves,
  divStats, topProjects, departments, endingSoon, pipeline, allDivisions,
}: Props) {
  const [filterDivision, setFilterDivision] = useState("");
  const [roleFilter,     setRoleFilter]     = useState("");

  const today = new Date(todayISO).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // ── Users matching the current Division + Role filters (drives all KPI tiles) ──
  const filteredUsers = useMemo(
    () => filterUsers(users, filterDivision, roleFilter),
    [users, filterDivision, roleFilter]
  );

  const totalHeadcount     = filteredUsers.length;
  const utilPct            = useMemo(() => computeUtilPct(filteredUsers, allocations), [filteredUsers, allocations]);
  const benchCount         = useMemo(() => computeBenchCount(filteredUsers, allocations), [filteredUsers, allocations]);
  const activeProjectCount = useMemo(
    () => computeActiveProjectCount(activeProjects, allocations, filteredUsers, filterDivision, roleFilter),
    [activeProjects, allocations, filteredUsers, filterDivision, roleFilter]
  );
  const pendingLeaveCount  = useMemo(
    () => computeFilteredLeaveCount(leaves, filterDivision, roleFilter),
    [leaves, filterDivision, roleFilter]
  );

  // ── Division Breakdown cards — headcount/utilisation recomputed per Role filter ──
  const divisionRoleStats = useMemo(
    () => buildDivisionRoleStats(divStats.map((d) => d.id), users, allocations, roleFilter),
    [divStats, users, allocations, roleFilter]
  );

  const visibleDivs = useMemo(() => {
    const merged = divStats.map((d) => {
      const roleStat = divisionRoleStats.find((r) => r.id === d.id);
      return roleStat ? { ...d, headcount: roleStat.headcount, utilPct: roleStat.utilPct } : d;
    });
    return filterDivision ? merged.filter((d) => d.id === filterDivision) : merged;
  }, [divStats, divisionRoleStats, filterDivision]);

  const filteredEndingSoon = useMemo(
    () => filterEndingSoon(endingSoon, filterDivision, roleFilter),
    [endingSoon, filterDivision, roleFilter]
  );

  const filteredTopProjects = useMemo(() => {
    let list = topProjects;

    // division filter
    if (filterDivision) list = list.filter((p) => p.divisionId === filterDivision);

    // role/department filter — re-sort by that dept's hours-to-date and only keep projects
    // that actually have activity from that department
    if (roleFilter) {
      list = list
        .filter((p) => (p.departmentHours[roleFilter] ?? 0) > 0)
        .sort((a, b) => (b.departmentHours[roleFilter] ?? 0) - (a.departmentHours[roleFilter] ?? 0));
    }

    return list.slice(0, 10);
  }, [topProjects, filterDivision, roleFilter]);

  return (
    <div className="page" data-screen-label="Dashboard">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Executive Dashboard</h1>
          <div className="page-sub">
            {today}
            {(roleFilter || filterDivision) && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · Showing {[roleFilter, allDivisions.find((d) => d.id === filterDivision)?.name]
                  .filter(Boolean)
                  .join(" · ")}
                {" "}(KPIs, Division Breakdown and Ending Soon — Pipeline always shows all)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Role / department filter (scopes the Top 10 Projects panel) */}
          {departments.length > 0 && (
            <select
              className="input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">All Roles</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          {/* Division filter */}
          <select
            className="input"
            value={filterDivision}
            onChange={(e) => setFilterDivision(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">All Divisions</option>
            {allDivisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Company KPIs ── */}
      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi ok">
          <div className="kpi-label">Headcount</div>
          <div className="kpi-value">{totalHeadcount}<span className="unit">people</span></div>
          <div className="kpi-meta">Active employees</div>
        </div>
        <div className="kpi" style={{ "--kpi-accent": utilColor(utilPct) } as React.CSSProperties}>
          <div className="kpi-label">Utilisation</div>
          <div className="kpi-value" style={{ color: utilColor(utilPct) }}>{utilPct}%</div>
          <div className="kpi-meta">Today's allocation rate</div>
        </div>
        <div className="kpi warn">
          <div className="kpi-label">On Bench</div>
          <div className="kpi-value">{benchCount}<span className="unit">people</span></div>
          <div className="kpi-meta">Not fully allocated today</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Active Projects</div>
          <div className="kpi-value">{activeProjectCount}</div>
          <div className="kpi-meta">Currently running</div>
        </div>
        <div className="kpi warn">
          <div className="kpi-label">Leave Requests</div>
          <div className="kpi-value">{pendingLeaveCount}</div>
          <div className="kpi-meta">Awaiting approval</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pipeline</div>
          <div className="kpi-value">{pipelineCount}</div>
          <div className="kpi-meta">Open opportunities</div>
        </div>
      </div>

      {/* ── Division Breakdown ── */}
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Division Breakdown
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 28 }}>
        {visibleDivs.map((d) => (
          <div key={d.id} className="card" style={{ padding: 18, borderLeft: `4px solid ${d.color}` }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 8, background: d.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                {d.code}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                {d.owner && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.owner.name}</div>}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 10 }}>
              <span><strong>{d.headcount}</strong> people</span>
              <span><strong>{d.projectCount}</strong> projects</span>
            </div>

            {/* Utilisation bar */}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>Utilisation</span>
              <span style={{ fontWeight: 600, color: utilColor(d.utilPct) }}>{d.utilPct}%</span>
            </div>
            <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3 }}>
              <div style={{ height: 6, borderRadius: 3, width: `${Math.min(d.utilPct, 100)}%`, background: utilColor(d.utilPct), transition: "width 0.3s" }} />
            </div>
          </div>
        ))}

        {visibleDivs.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", gridColumn: "1/-1", fontSize: 14 }}>
            No divisions found.
          </div>
        )}
      </div>

      {/* ── Top Projects by Hours-to-Date ── */}
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Top 10 Projects by Hours-to-Date{roleFilter && <span style={{ textTransform: "none", fontWeight: 400, marginLeft: 8, color: "var(--accent)", fontSize: 12 }}>· {roleFilter}</span>}
      </h2>
      <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 28 }}>
        {filteredTopProjects.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No project activity recorded yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left",  padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Project</th>
                <th style={{ textAlign: "left",  padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Manager</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Allocated</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Hours to Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopProjects.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < filteredTopProjects.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <Link
                      href={`/projects?search=${encodeURIComponent(p.code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 500, color: "var(--accent)" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.code}</div>
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 12 }}>{p.managerName ?? "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {roleFilter
                      ? Math.round(p.departmentAllocatedHours[roleFilter] ?? 0)
                      : Math.round(p.allocatedHours)}h
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>
                    {roleFilter
                      ? Math.round(p.departmentHours[roleFilter] ?? 0)
                      : Math.round(p.hoursToDate)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Bottom two panels ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Allocations ending soon */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Allocations Ending in 14 Days
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {filteredEndingSoon.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No allocations ending soon.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Person</th>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Project</th>
                    <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEndingSoon.map((e, i) => {
                    const daysLeft = Math.ceil((new Date(e.endDate).getTime() - Date.now()) / 86400000);
                    return (
                      <tr key={i} style={{ borderBottom: i < filteredEndingSoon.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 500 }}>{e.userName}</td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 12 }}>{e.projectName}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 12 }}>{fmtDate(e.endDate)}</span>
                          <span style={{ fontSize: 11, marginLeft: 6, color: daysLeft <= 3 ? "#ef4444" : "var(--text-muted)" }}>
                            ({daysLeft}d)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pipeline */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pipeline
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {pipeline.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No open pipeline items.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Opportunity</th>
                    <th style={{ textAlign: "center", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Stage</th>
                    <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 500, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Prob.</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.slice(0, 10).map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < Math.min(pipeline.length, 10) - 1 ? "1px solid var(--border)" : "none" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        {p.expectedStartDate && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Start: {fmtDate(p.expectedStartDate)}</div>}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 500,
                          background: "var(--surface-2)", border: "1px solid var(--border)",
                        }}>
                          {PIPELINE_LABELS[p.status] ?? p.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <span style={{ fontWeight: 600, color: p.probability >= 70 ? "var(--ok)" : "var(--warn)" }}>
                          {p.probability}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

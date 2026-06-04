"use client";

import { useState, useMemo } from "react";
import type { Role } from "@/types/enums";

type DivisionRef = { id: string; name: string; code: string; color: string };

type User = {
  id: string;
  name: string | null;
  email: string | null;
  capacity: number;
  role: Role;
  divisionId: string | null;
};

type Project = {
  id: string;
  name: string;
  code: string;
  color: string;
};

type Allocation = {
  id: string;
  userId: string;
  projectId: string;
  taskId: string | null;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: User;
  project: Project;
  task: { id: string; name: string } | null;
};

type EditState = {
  id: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  notes: string;
  userName: string;
  projectName: string;
  userCapacity: number;
};

interface Props {
  allocations: Allocation[];
  currentUserRole: Role;
  divisions: DivisionRef[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function calcPct(hoursPerDay: number, capacity: number): number {
  const dailyCap = capacity / 5;
  if (dailyCap <= 0) return 0;
  return Math.round((hoursPerDay / dailyCap) * 100);
}

function pctChipClass(pct: number): string {
  if (pct > 100) return "chip bad";
  if (pct >= 90) return "chip warn";
  if (pct > 0)   return "chip ok";
  return "chip";
}

function initials(name: string | null, email: string | null): string {
  return (name ?? email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type StatusFilter = "active" | "upcoming" | "expired" | "all";

export function AllocationListClient({ allocations, currentUserRole, divisions }: Props) {
  const canEdit = ["ADMIN", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(currentUserRole);

  const [search,          setSearch]         = useState("");
  const [projectFilter,   setProjectFilter]  = useState("all");
  const [resourceFilter,  setResourceFilter] = useState("all");
  const [divisionFilter,  setDivisionFilter] = useState("all");
  const [statusFilter,    setStatusFilter]   = useState<StatusFilter>("active");
  const [editState,     setEditState]     = useState<EditState | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Base — pre-filtered by division
  const divBase = useMemo(() =>
    divisionFilter === "all"
      ? allocations
      : allocations.filter((a) => a.user.divisionId === divisionFilter),
  [allocations, divisionFilter]);

  // Projects list — narrowed to those the selected resource is allocated to
  const projects = useMemo(() => {
    const source = resourceFilter === "all"
      ? divBase
      : divBase.filter((a) => a.user.id === resourceFilter);
    const seen = new Map<string, { id: string; name: string; code: string }>();
    for (const a of source) {
      if (!seen.has(a.project.id))
        seen.set(a.project.id, { id: a.project.id, name: a.project.name, code: a.project.code });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [divBase, resourceFilter]);

  // Resources list — narrowed to those allocated on the selected project
  const resources = useMemo(() => {
    const source = projectFilter === "all"
      ? divBase
      : divBase.filter((a) => a.project.id === projectFilter);
    const seen = new Map<string, { id: string; name: string }>();
    for (const a of source) {
      if (!seen.has(a.user.id))
        seen.set(a.user.id, { id: a.user.id, name: a.user.name ?? a.user.email ?? "Unknown" });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [divBase, projectFilter]);

  // Tab counts — scoped to the current division filter
  const counts = useMemo(() => ({
    active:   divBase.filter((a) => a.startDate.slice(0,10) <= todayStr && a.endDate.slice(0,10) >= todayStr).length,
    upcoming: divBase.filter((a) => a.startDate.slice(0,10) > todayStr).length,
    expired:  divBase.filter((a) => a.endDate.slice(0,10)   < todayStr).length,
    all:      divBase.length,
  }), [divBase, todayStr]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return divBase.filter((a) => {
      // Date filter
      const start = a.startDate.slice(0, 10);
      const end   = a.endDate.slice(0, 10);
      if (statusFilter === "active"   && !(start <= todayStr && end >= todayStr)) return false;
      if (statusFilter === "upcoming" && !(start > todayStr))                     return false;
      if (statusFilter === "expired"  && !(end   < todayStr))                     return false;

      // Resource filter
      if (resourceFilter !== "all" && a.user.id !== resourceFilter) return false;

      // Project filter
      if (projectFilter !== "all" && a.project.id !== projectFilter) return false;

      // Search filter
      if (q && !(
        (a.user.name  ?? "").toLowerCase().includes(q) ||
        (a.user.email ?? "").toLowerCase().includes(q) ||
        a.project.name.toLowerCase().includes(q) ||
        a.project.code.toLowerCase().includes(q)
      )) return false;

      return true;
    });
  }, [divBase, search, projectFilter, resourceFilter, statusFilter, todayStr]);

  // ── Resource summary (when one resource selected, no project) ────────────────
  const resourceSummary = useMemo(() => {
    if (resourceFilter === "all") return null;
    const user = allocations.find((a) => a.user.id === resourceFilter)?.user;
    if (!user) return null;
    const active = allocations.filter(
      (a) => a.user.id === resourceFilter &&
             a.startDate.slice(0, 10) <= todayStr &&
             a.endDate.slice(0, 10)   >= todayStr
    );
    const dailyCap     = user.capacity / 5;
    const allocatedH   = active.reduce((s, a) => s + a.hoursPerDay, 0);
    const allocatedPct = dailyCap > 0 ? Math.min(100, Math.round((allocatedH / dailyCap) * 100)) : 0;
    const freePct      = Math.max(0, 100 - allocatedPct);
    return { name: user.name ?? user.email, allocatedPct, freePct, activeCount: active.length };
  }, [resourceFilter, allocations, todayStr]);

  // ── Project summary (when one project selected, no resource) ─────────────────
  const projectSummary = useMemo(() => {
    if (projectFilter === "all" || resourceFilter !== "all") return null;
    const proj = allocations.find((a) => a.project.id === projectFilter)?.project;
    if (!proj) return null;

    const allForProject    = allocations.filter((a) => a.project.id === projectFilter);
    const activeForProject = allForProject.filter(
      (a) => a.startDate.slice(0, 10) <= todayStr && a.endDate.slice(0, 10) >= todayStr
    );

    // Tile 1 — unique active people per role
    const roleCount: Record<string, Set<string>> = {};
    for (const a of activeForProject) {
      const role = a.user.role.replace(/_/g, " ");
      if (!roleCount[role]) roleCount[role] = new Set();
      roleCount[role].add(a.user.id);
    }
    const byRoleCount = Object.entries(roleCount)
      .map(([role, ids]) => ({ role, count: ids.size }))
      .sort((a, b) => b.count - a.count);

    // Tile 4 — sum of allocation % per role (active allocations)
    const rolePct: Record<string, number> = {};
    for (const a of activeForProject) {
      const role     = a.user.role.replace(/_/g, " ");
      const dailyCap = a.user.capacity / 5;
      const pct      = dailyCap > 0 ? Math.round((a.hoursPerDay / dailyCap) * 100) : 0;
      rolePct[role]  = (rolePct[role] ?? 0) + pct;
    }
    const byRolePct = Object.entries(rolePct)
      .map(([role, pct]) => ({ role, pct }))
      .sort((a, b) => b.pct - a.pct);

    return {
      projectName:      proj.name,
      projectColor:     proj.color,
      activeCount:      activeForProject.length,
      totalCount:       allForProject.length,
      uniqueActive:     new Set(activeForProject.map((a) => a.user.id)).size,
      byRoleCount,
      byRolePct,
    };
  }, [projectFilter, resourceFilter, allocations, todayStr]);

  function openEdit(a: Allocation) {
    setEditState({
      id:           a.id,
      startDate:    a.startDate.slice(0, 10),
      endDate:      a.endDate.slice(0, 10),
      hoursPerDay:  a.hoursPerDay,
      notes:        a.notes ?? "",
      userName:     a.user.name ?? a.user.email ?? "Unknown",
      projectName:  a.project.name,
      userCapacity: a.user.capacity,
    });
  }

  async function saveEdit() {
    if (!editState) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/allocations/${editState.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate:   editState.startDate,
          endDate:     editState.endDate,
          hoursPerDay: editState.hoursPerDay,
          notes:       editState.notes || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error ?? "Failed to update");
        return;
      }
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/allocations/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error ?? "Failed to delete");
        return;
      }
      window.location.reload();
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  const editPct      = editState ? calcPct(editState.hoursPerDay, editState.userCapacity) : 0;
  const editDailyCap = editState ? editState.userCapacity / 5 : 8;

  const deleteAlloc = deleteId ? allocations.find((a) => a.id === deleteId) : null;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Allocation List</h1>
          <div className="page-sub">
            {filtered.length} allocation{filtered.length !== 1 ? "s" : ""}
            {allocations.length !== filtered.length && ` of ${allocations.length}`}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "active",   label: "Active"    },
          { key: "upcoming", label: "Upcoming"  },
          { key: "expired",  label: "Expired"   },
          { key: "all",      label: "All"       },
        ] as { key: StatusFilter; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding:      "8px 16px",
              border:       "none",
              background:   "transparent",
              borderBottom: statusFilter === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              color:        statusFilter === tab.key ? "var(--accent)" : "var(--text-muted)",
              fontWeight:   statusFilter === tab.key ? 600 : 400,
              fontSize:     13,
              cursor:       "pointer",
              display:      "flex",
              alignItems:   "center",
              gap:          6,
              marginBottom: -1,
            }}
          >
            {tab.label}
            <span style={{
              fontSize:    11,
              fontWeight:  500,
              padding:     "1px 6px",
              borderRadius: 10,
              background:  statusFilter === tab.key ? "var(--accent)" : "var(--surface-2)",
              color:       statusFilter === tab.key ? "#fff" : "var(--text-muted)",
              minWidth:    20,
              textAlign:   "center",
            }}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div className="search" style={{ width: 280 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search resource or project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 0, outline: 0, flex: 1, background: "transparent", fontSize: 13 }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ color: "var(--text-faint)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
            >
              ×
            </button>
          )}
        </div>
        {divisions.length > 0 && (
          <select
            className="select-sm"
            value={divisionFilter}
            onChange={(e) => { setDivisionFilter(e.target.value); setResourceFilter("all"); setProjectFilter("all"); }}
          >
            <option value="all">All divisions</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
            ))}
          </select>
        )}
        <select
          className="select-sm"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
        >
          <option value="all">All resources</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          className="select-sm"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </div>

      {/* ── Resource summary — shown when a specific resource is selected ── */}
      {resourceSummary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            {
              label: "Allocated today",
              value: `${resourceSummary.allocatedPct}%`,
              color: resourceSummary.allocatedPct >= 100 ? "var(--bad)" : resourceSummary.allocatedPct >= 80 ? "var(--warn)" : "var(--ok)",
              bar: resourceSummary.allocatedPct,
            },
            {
              label: "Free today",
              value: `${resourceSummary.freePct}%`,
              color: resourceSummary.freePct === 0 ? "var(--text-muted)" : "var(--ok)",
              bar: resourceSummary.freePct,
            },
            {
              label: "Active allocations",
              value: String(resourceSummary.activeCount),
              color: "var(--text)",
              sub: "running today",
            },
          ].map((tile) => (
            <div key={tile.label} className="card" style={{ flex: "0 0 auto", padding: "14px 24px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{tile.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: tile.color }}>{tile.value}</div>
              {tile.bar !== undefined && (
                <div style={{ marginTop: 6, width: 100, height: 5, background: "var(--surface-2)", borderRadius: 3 }}>
                  <div style={{ height: 5, borderRadius: 3, width: `${Math.min(100, tile.bar)}%`, background: tile.color }} />
                </div>
              )}
              {tile.sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{tile.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Project summary — shown when a specific project is selected (no resource) ── */}
      {projectSummary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "stretch" }}>

          {/* Tile 1 — Resources by role (count) */}
          <div className="card" style={{ flex: "0 0 auto", padding: "14px 20px", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Resources by role</div>
            {projectSummary.byRoleCount.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>None active today</div>
            ) : projectSummary.byRoleCount.map(({ role, count }) => (
              <div key={role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{role}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{count}</span>
              </div>
            ))}
          </div>

          {/* Tile 2 — Active allocations */}
          <div className="card" style={{ flex: "0 0 auto", padding: "14px 24px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 130 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Active today</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ok)" }}>{projectSummary.activeCount}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{projectSummary.uniqueActive} unique people</div>
          </div>

          {/* Tile 3 — Total allocations */}
          <div className="card" style={{ flex: "0 0 auto", padding: "14px 24px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 130 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Total allocations</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{projectSummary.totalCount}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>all time</div>
          </div>

          {/* Tile 4 — Sum of allocation % per role */}
          <div className="card" style={{ flex: "0 0 auto", padding: "14px 20px", minWidth: 180 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Allocation % by role</div>
            {projectSummary.byRolePct.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>None active today</div>
            ) : projectSummary.byRolePct.map(({ role, pct }) => (
              <div key={role} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{role}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pct > 100 ? "var(--bad)" : "var(--text)" }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, pct)}%`, background: pct > 100 ? "var(--bad)" : "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div className="placeholder-pane">
            <h3>No allocations found</h3>
            <div>Try adjusting the search or filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  {(["Resource", "Project", "Start Date", "End Date", "Hrs / Day", "% Alloc", canEdit ? "Actions" : ""] as string[])
                    .filter((h) => h !== "")
                    .map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "9px 14px",
                          fontWeight: 500,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                          textAlign: h === "Actions" || h === "% Alloc" ? "center" : "left",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const pct       = calcPct(a.hoursPerDay, a.user.capacity);
                  const isLast    = i === filtered.length - 1;
                  const isExpired = a.endDate.slice(0, 10) < todayStr;
                  const isUpcoming = a.startDate.slice(0, 10) > todayStr;

                  return (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom: isLast ? "none" : "1px solid var(--border)",
                        opacity: isExpired ? 0.55 : 1,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      {/* Resource */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span className="avatar" style={{ flexShrink: 0 }}>
                            {initials(a.user.name, a.user.email)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 500 }}>{a.user.name ?? a.user.email}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                              {a.user.role.replace(/_/g, " ")}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Project */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 10, height: 10, borderRadius: 3,
                              background: a.project.color, flexShrink: 0,
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 500 }}>{a.project.name}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              {a.project.code}
                              {a.task && <span style={{ color: "var(--text-faint)" }}> · {a.task.name}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Start Date */}
                      <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {fmtDate(a.startDate)}
                      </td>

                      {/* End Date */}
                      <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {fmtDate(a.endDate)}
                        {isExpired  && <span className="chip bad"  style={{ marginLeft: 6, fontSize: 10, fontFamily: "var(--font-sans)" }}>Expired</span>}
                        {isUpcoming && <span className="chip"      style={{ marginLeft: 6, fontSize: 10, fontFamily: "var(--font-sans)" }}>Upcoming</span>}
                      </td>

                      {/* Hrs / Day */}
                      <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                        {a.hoursPerDay}h / day
                      </td>

                      {/* % Alloc */}
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <span className={pctChipClass(pct)}>{pct}%</span>
                      </td>

                      {/* Actions */}
                      {canEdit && (
                        <td style={{ padding: "11px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              className="btn sm"
                              onClick={() => openEdit(a)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn sm danger"
                              onClick={() => setDeleteId(a.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Edit Allocation</h2>
              <button className="iconbtn" onClick={() => setEditState(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--surface-2)",
                  borderRadius: 6,
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                <strong style={{ color: "var(--text)" }}>{editState.userName}</strong>
                {" · "}
                {editState.projectName}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={editState.startDate}
                    onChange={(e) => setEditState({ ...editState, startDate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>End date</label>
                  <input
                    type="date"
                    value={editState.endDate}
                    min={editState.startDate}
                    onChange={(e) => setEditState({ ...editState, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Hours per day</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={editState.hoursPerDay}
                  onChange={(e) =>
                    setEditState({ ...editState, hoursPerDay: parseFloat(e.target.value) || 0 })
                  }
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  = {editPct}% of daily capacity ({editDailyCap}h / day)
                </span>
              </div>

              <div className="field">
                <label>
                  Notes{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={editState.notes}
                  placeholder="Any notes…"
                  onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                />
              </div>
            </div>

            <div style={{ padding: "0 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditState(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={saveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteId && deleteAlloc && (
        <div className="modal-backdrop" onClick={() => setDeleteId(null)}>
          <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Delete Allocation</h2>
              <button className="iconbtn" onClick={() => setDeleteId(null)}>✕</button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Delete the allocation for{" "}
                <strong style={{ color: "var(--text)" }}>
                  {deleteAlloc.user.name ?? deleteAlloc.user.email}
                </strong>{" "}
                on{" "}
                <strong style={{ color: "var(--text)" }}>{deleteAlloc.project.name}</strong>
                {" "}({fmtDate(deleteAlloc.startDate)} – {fmtDate(deleteAlloc.endDate)})?
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                This cannot be undone.
              </p>
            </div>

            <div style={{ padding: "0 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={doDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete allocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

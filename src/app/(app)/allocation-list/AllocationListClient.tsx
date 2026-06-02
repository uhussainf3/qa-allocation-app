"use client";

import { useState, useMemo } from "react";
import type { Role } from "@/types/enums";

type User = {
  id: string;
  name: string | null;
  email: string | null;
  capacity: number;
  role: Role;
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

export function AllocationListClient({ allocations, currentUserRole }: Props) {
  const canEdit = currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  const [search,        setSearch]        = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("active");
  const [editState,     setEditState]     = useState<EditState | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const projects = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; code: string }>();
    for (const a of allocations) {
      if (!seen.has(a.project.id))
        seen.set(a.project.id, { id: a.project.id, name: a.project.name, code: a.project.code });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allocations]);

  // Tab counts — computed once from full list
  const counts = useMemo(() => ({
    active:   allocations.filter((a) => a.startDate.slice(0,10) <= todayStr && a.endDate.slice(0,10) >= todayStr).length,
    upcoming: allocations.filter((a) => a.startDate.slice(0,10) > todayStr).length,
    expired:  allocations.filter((a) => a.endDate.slice(0,10)   < todayStr).length,
    all:      allocations.length,
  }), [allocations, todayStr]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allocations.filter((a) => {
      // Date filter
      const start = a.startDate.slice(0, 10);
      const end   = a.endDate.slice(0, 10);
      if (statusFilter === "active"   && !(start <= todayStr && end >= todayStr)) return false;
      if (statusFilter === "upcoming" && !(start > todayStr))                     return false;
      if (statusFilter === "expired"  && !(end   < todayStr))                     return false;

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
  }, [allocations, search, projectFilter, statusFilter, todayStr]);

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

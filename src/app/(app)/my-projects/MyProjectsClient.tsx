"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type SimpleUser = {
  id: string; name: string | null; email: string | null;
  capacity: number; department: string | null; divisionId: string | null;
  role: string;
};

type AllocUser = {
  id: string; name: string | null; email: string | null;
  capacity: number; department: string | null; divisionId: string | null;
};

type Allocation = {
  id: string; userId: string; projectId: string;
  startDate: string; endDate: string; hoursPerDay: number; notes: string | null;
  user: AllocUser;
};

type Project = {
  id: string; name: string; code: string; status: string; color: string;
  startDate: string | null; endDate: string | null;
  manager: { id: string; name: string | null } | null;
  allocations: Allocation[];
};

type Division = { id: string; name: string; code: string; color: string };

type InlineEdit = { startDate: string; endDate: string; allocPct: number; saving: boolean; error: string };

interface Props {
  projects:        Project[];
  allUsers:        SimpleUser[];
  divisions:       Division[];
  pmUsers:         SimpleUser[];
  currentUserId:   string;
  currentUserRole: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null) {
  return (name ?? email ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pctToHpd(pct: number, capacityPerWeek: number): number {
  return Math.round((pct / 100) * (capacityPerWeek / 5) * 10) / 10;
}

function hpdToPct(hpd: number, capacityPerWeek: number): number {
  const daily = capacityPerWeek / 5;
  return daily > 0 ? Math.round((hpd / daily) * 100) : 0;
}

function classifyAllocation(alloc: Allocation, todayStr: string): "current" | "future" | "past" {
  const start = alloc.startDate.slice(0, 10);
  const end   = alloc.endDate.slice(0, 10);
  if (end < todayStr)   return "past";
  if (start > todayStr) return "future";
  return "current";
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "var(--ok)",
  ON_HOLD:   "var(--warn)",
  COMPLETED: "var(--text-muted)",
  CANCELLED: "var(--bad)",
};

const SECTION_META = {
  current: { label: "Current",  color: "var(--ok)",      bg: "rgba(34,197,94,.08)"  },
  future:  { label: "Future",   color: "var(--accent)",  bg: "rgba(99,102,241,.08)" },
  past:    { label: "Past",     color: "var(--text-muted)", bg: "var(--surface-2)"  },
};

// ─── Add Allocation Modal (new allocations only) ───────────────────────────────

interface AddModalProps {
  projects:  Project[];
  allUsers:  SimpleUser[];
  divisions: Division[];
  onClose:   () => void;
  onSaved:   () => void;
}

function AddModal({ projects, allUsers, divisions, onClose, onSaved }: AddModalProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [projectId,  setProjectId]  = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [userId,     setUserId]     = useState("");
  const [startDate,  setStartDate]  = useState(todayStr);
  const [endDate,    setEndDate]    = useState(todayStr);
  const [allocPct,   setAllocPct]   = useState(100);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const divisionUsers = useMemo(
    () => allUsers.filter((u) =>
      ["MEMBER", "PROJECT_MANAGER"].includes(u.role) &&
      (divisionId ? u.divisionId === divisionId : true)
    ),
    [allUsers, divisionId]
  );

  async function handleSave() {
    if (!projectId) { setError("Select a project."); return; }
    if (!userId)    { setError("Select a resource."); return; }
    if (endDate < startDate) { setError("End date must be after start date."); return; }
    if (allocPct <= 0 || allocPct > 200) { setError("Allocation % must be between 1 and 200."); return; }

    const user = allUsers.find((u) => u.id === userId);
    const hoursPerDay = pctToHpd(allocPct, user?.capacity ?? 40);

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, projectId, startDate, endDate, hoursPerDay }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Failed to save."); return; }
      onSaved(); onClose();
    } catch { setError("Network error."); }
    finally   { setSaving(false); }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: 480, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Add Resource Allocation</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">
            <span>Project</span>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Division (filter resources)</span>
            <select className="input" value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setUserId(""); }} style={{ width: "100%" }}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </label>
          <label className="field">
            <span>Resource</span>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Select resource…</option>
              {divisionUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}{u.department ? ` · ${u.department}` : ""}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <span>Start date</span>
              <input className="input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
            </label>
            <label className="field">
              <span>End date</span>
              <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Allocation %</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="input" type="number" min={1} max={200} value={allocPct} onChange={(e) => setAllocPct(Number(e.target.value))} style={{ width: 100 }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                = {pctToHpd(allocPct, allUsers.find((u) => u.id === userId)?.capacity ?? 40)}h/day
              </span>
            </div>
          </label>
        </div>
        {error && <div style={{ marginTop: 12, color: "var(--bad)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Add Allocation"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Allocation section ────────────────────────────────────────────────────────

interface SectionProps {
  type:      "current" | "future" | "past";
  allocs:    Allocation[];
  canEdit:   boolean;
  allUsers:  SimpleUser[];
  editing:   Record<string, InlineEdit>;
  deleting:  string | null;
  onStartEdit:  (alloc: Allocation) => void;
  onCancelEdit: (id: string) => void;
  onChangeEdit: (id: string, field: keyof Omit<InlineEdit, "saving" | "error">, value: string | number) => void;
  onSaveEdit:   (alloc: Allocation) => void;
  onDelete:     (id: string) => void;
}

function AllocSection({ type, allocs, canEdit, allUsers, editing, deleting, onStartEdit, onCancelEdit, onChangeEdit, onSaveEdit, onDelete }: SectionProps) {
  if (allocs.length === 0) return null;
  const meta    = SECTION_META[type];
  const isPast  = type === "past";

  return (
    <div style={{ marginTop: 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color, padding: "2px 8px", borderRadius: 8, background: meta.bg }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{allocs.length} resource{allocs.length !== 1 ? "s" : ""}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Resource", "Dept", "Alloc %", "h/day", "Start date", "End date", ""].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "5px 10px", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allocs.map((alloc) => {
            const ed      = editing[alloc.id];
            const origPct = hpdToPct(alloc.hoursPerDay, alloc.user.capacity);
            const dirty   = ed && (ed.startDate !== alloc.startDate.slice(0, 10) || ed.endDate !== alloc.endDate.slice(0, 10) || ed.allocPct !== origPct);

            return (
              <tr key={alloc.id} style={{ borderBottom: "1px solid var(--border-faint)", opacity: isPast ? 0.7 : 1, background: ed ? "var(--surface-2)" : undefined }}>
                {/* Resource */}
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="avatar" style={{ fontSize: 11, width: 26, height: 26, flexShrink: 0 }}>{initials(alloc.user.name, alloc.user.email)}</span>
                    <span style={{ fontWeight: 500 }}>{alloc.user.name ?? alloc.user.email}</span>
                  </div>
                </td>

                {/* Dept */}
                <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: 12 }}>{alloc.user.department ?? "—"}</td>

                {/* Alloc % */}
                <td style={{ padding: "8px 10px" }}>
                  {ed && !isPast ? (
                    <input
                      type="number" min={1} max={200} value={ed.allocPct}
                      onChange={(e) => onChangeEdit(alloc.id, "allocPct", Number(e.target.value))}
                      style={{ width: 70, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, background: "var(--surface)" }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, origPct)}%`, height: "100%", background: origPct > 100 ? "var(--bad)" : origPct >= 80 ? "var(--warn)" : "var(--ok)" }} />
                      </div>
                      <span style={{ fontWeight: 500 }}>{origPct}%</span>
                    </div>
                  )}
                </td>

                {/* h/day */}
                <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: 12 }}>
                  {ed && !isPast
                    ? `${pctToHpd(ed.allocPct, alloc.user.capacity)}h`
                    : `${alloc.hoursPerDay}h`}
                </td>

                {/* Start date */}
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  {ed && !isPast ? (
                    <input
                      type="date" value={ed.startDate}
                      onChange={(e) => { onChangeEdit(alloc.id, "startDate", e.target.value); if (ed.endDate < e.target.value) onChangeEdit(alloc.id, "endDate", e.target.value); }}
                      style={{ padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--surface)" }}
                    />
                  ) : (
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(alloc.startDate)}</span>
                  )}
                </td>

                {/* End date */}
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  {ed && !isPast ? (
                    <input
                      type="date" value={ed.endDate} min={ed.startDate}
                      onChange={(e) => onChangeEdit(alloc.id, "endDate", e.target.value)}
                      style={{ padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--surface)" }}
                    />
                  ) : (
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(alloc.endDate)}</span>
                  )}
                </td>

                {/* Actions */}
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {canEdit && !isPast && (
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {ed ? (
                        <>
                          <button
                            className="btn btn-sm primary"
                            disabled={!dirty || ed.saving}
                            onClick={() => onSaveEdit(alloc)}
                            style={{ fontSize: 11 }}
                          >
                            {ed.saving ? "…" : "Save"}
                          </button>
                          <button className="btn btn-sm" onClick={() => onCancelEdit(alloc.id)} style={{ fontSize: 11 }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm" onClick={() => onStartEdit(alloc)} style={{ fontSize: 11 }}>Edit</button>
                          <button
                            className="btn btn-sm" style={{ color: "var(--bad)", fontSize: 11 }}
                            disabled={deleting === alloc.id}
                            onClick={() => onDelete(alloc.id)}
                          >
                            {deleting === alloc.id ? "…" : "Remove"}
                          </button>
                        </>
                      )}
                      {ed?.error && <span style={{ fontSize: 11, color: "var(--bad)" }}>{ed.error}</span>}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MyProjectsClient({
  projects: initial, allUsers, divisions, pmUsers,
  currentUserId, currentUserRole,
}: Props) {
  const router  = useRouter();
  const isAdmin = currentUserRole === "ADMIN";
  const isOwner = (p: Project) => p.manager?.id === currentUserId || isAdmin;

  const todayStr = new Date().toISOString().slice(0, 10);

  const [projects,  setProjects]  = useState<Project[]>(initial);
  const [pmFilter,  setPmFilter]  = useState(isAdmin ? "" : currentUserId);
  const [showAdd,   setShowAdd]   = useState(false);
  const [editing,   setEditing]   = useState<Record<string, InlineEdit>>({});
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});

  const visibleProjects = useMemo(() =>
    pmFilter ? projects.filter((p) => p.manager?.id === pmFilter) : projects,
    [projects, pmFilter]
  );

  function toggle(id: string) {
    setExpanded((s) => ({ ...s, [id]: !(s[id] ?? true) }));
  }

  // ── Inline edit helpers ──────────────────────────────────────────────────────
  function startEdit(alloc: Allocation) {
    setEditing((s) => ({
      ...s,
      [alloc.id]: {
        startDate: alloc.startDate.slice(0, 10),
        endDate:   alloc.endDate.slice(0, 10),
        allocPct:  hpdToPct(alloc.hoursPerDay, alloc.user.capacity),
        saving:    false,
        error:     "",
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditing((s) => { const n = { ...s }; delete n[id]; return n; });
  }

  function changeEdit(id: string, field: keyof Omit<InlineEdit, "saving" | "error">, value: string | number) {
    setEditing((s) => s[id] ? { ...s, [id]: { ...s[id], [field]: value, error: "" } } : s);
  }

  async function saveEdit(alloc: Allocation) {
    const ed = editing[alloc.id];
    if (!ed) return;
    const hoursPerDay = pctToHpd(ed.allocPct, alloc.user.capacity);
    setEditing((s) => ({ ...s, [alloc.id]: { ...s[alloc.id], saving: true, error: "" } }));
    try {
      const res = await fetch(`/api/allocations/${alloc.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: ed.startDate, endDate: ed.endDate, hoursPerDay }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setEditing((s) => ({ ...s, [alloc.id]: { ...s[alloc.id], saving: false, error: j.error ?? "Failed." } }));
        return;
      }
      // Update local state
      setProjects((prev) => prev.map((p) => ({
        ...p,
        allocations: p.allocations.map((a) =>
          a.id === alloc.id
            ? { ...a, startDate: ed.startDate + "T00:00:00.000Z", endDate: ed.endDate + "T00:00:00.000Z", hoursPerDay }
            : a
        ),
      })));
      cancelEdit(alloc.id);
    } catch {
      setEditing((s) => ({ ...s, [alloc.id]: { ...s[alloc.id], saving: false, error: "Network error." } }));
    }
  }

  async function handleDelete(allocId: string) {
    if (!confirm("Remove this allocation?")) return;
    setDeleting(allocId);
    try {
      await fetch(`/api/allocations/${allocId}`, { method: "DELETE" });
      setProjects((prev) => prev.map((p) => ({
        ...p, allocations: p.allocations.filter((a) => a.id !== allocId),
      })));
    } finally { setDeleting(null); }
  }

  const totalProjects    = visibleProjects.length;
  const totalResources   = new Set(visibleProjects.flatMap((p) => p.allocations.map((a) => a.userId))).size;
  const totalAllocations = visibleProjects.reduce((s, p) => s + p.allocations.length, 0);

  return (
    <div className="page" data-screen-label="My Projects">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">My Projects</h1>
          <div className="page-sub">{totalProjects} projects · {totalResources} resources · {totalAllocations} allocations</div>
        </div>
        <div className="page-actions">
          {isAdmin && pmUsers.length > 0 && (
            <select className="select-sm" value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
              <option value="">All PMs</option>
              {pmUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add Allocation</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Projects</div>
          <div className="kpi-value">{totalProjects}</div>
          <div className="kpi-meta">Active &amp; on-hold</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Resources</div>
          <div className="kpi-value">{totalResources}</div>
          <div className="kpi-meta">Unique people allocated</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Allocations</div>
          <div className="kpi-value">{totalAllocations}</div>
          <div className="kpi-meta">Total allocation entries</div>
        </div>
      </div>

      {/* Project cards */}
      {visibleProjects.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
          {pmFilter ? "No projects found for this PM." : "No projects assigned to you yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visibleProjects.map((project) => {
            const open    = expanded[project.id] ?? true;
            const canEdit = isOwner(project);

            const current = project.allocations.filter((a) => classifyAllocation(a, todayStr) === "current");
            const future  = project.allocations.filter((a) => classifyAllocation(a, todayStr) === "future");
            const past    = project.allocations.filter((a) => classifyAllocation(a, todayStr) === "past");

            const sectionProps = { canEdit, allUsers, editing, deleting, onStartEdit: startEdit, onCancelEdit: cancelEdit, onChangeEdit: changeEdit, onSaveEdit: saveEdit, onDelete: handleDelete };

            return (
              <div key={project.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Project header */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", borderBottom: open ? "1px solid var(--border)" : "none", background: "var(--surface-2)" }}
                  onClick={() => toggle(project.id)}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: project.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{project.name}</span>
                      <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>{project.code}</span>
                      <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, color: STATUS_COLORS[project.status] ?? "var(--text-muted)", border: `1px solid ${STATUS_COLORS[project.status] ?? "var(--border)"}` }}>
                        {project.status.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {project.manager && <span>PM: {project.manager.name}</span>}
                      {project.startDate && <span>{fmtDate(project.startDate)} → {fmtDate(project.endDate)}</span>}
                      <span>{current.length} current · {future.length} future · {past.length} past</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "", transition: "transform 0.15s", flexShrink: 0 }}>›</span>
                </div>

                {/* Body */}
                {open && (
                  <div style={{ padding: "6px 18px 16px" }}>
                    {project.allocations.length === 0 ? (
                      <div style={{ padding: "18px 0", color: "var(--text-muted)", fontSize: 13 }}>
                        No resources allocated yet.
                      </div>
                    ) : (
                      <>
                        <AllocSection type="current" allocs={current} {...sectionProps} />
                        <AllocSection type="future"  allocs={future}  {...sectionProps} />
                        <AllocSection type="past"    allocs={past}    {...sectionProps} />
                      </>
                    )}

                    {canEdit && (
                      <button className="btn" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setShowAdd(true)}>
                        + Add resource
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add allocation modal */}
      {showAdd && (
        <AddModal
          projects={visibleProjects.filter((p) => isOwner(p))}
          allUsers={allUsers}
          divisions={divisions}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

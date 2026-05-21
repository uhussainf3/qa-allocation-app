"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

type Subtask = { id: string; name: string; estimatedHours: number };
type Task = { id: string; name: string; estimatedHours: number; subtasks: Subtask[] };
type EngineerBreakdown = { userId: string; userName: string | null; hoursToDate: number; totalAllocated: number };
type Project = {
  id: string; name: string; code: string; description: string | null;
  clientName: string | null; status: string; sanctionedHours: number;
  startDate: string | null; endDate: string | null; color: string;
  consumedHours: number; allocatedHours: number; hoursToDate: number;
  engineerBreakdown: EngineerBreakdown[]; tasks: Task[];
  _count: { allocations: number; hoursLogs: number };
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "ok", ON_HOLD: "warn", COMPLETED: "idle", CANCELLED: "bad",
};

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

interface Props { projects: Project[]; currentUserRole: Role; }

export function ProjectsClient({ projects, currentUserRole }: Props) {
  const [selected, setSelected] = useState<Project | null>(projects[0] ?? null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", clientName: "", sanctionedHours: 0, color: COLORS[0], status: "ACTIVE", startDate: "", endDate: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const canEdit = currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  function selectProject(p: Project) {
    setSelected(p);
    setShowBreakdown(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sanctionedHours: Number(form.sanctionedHours) }),
      });
      if (res.ok) { setShowModal(false); window.location.reload(); }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    window.location.reload();
  }

  const proj = selected;
  const remaining   = proj ? proj.sanctionedHours - proj.consumedHours : 0;
  const usedPct     = proj && proj.sanctionedHours > 0 ? Math.round((proj.consumedHours  / proj.sanctionedHours) * 100) : 0;
  const allocPct    = proj && proj.sanctionedHours > 0 ? Math.round((proj.allocatedHours / proj.sanctionedHours) * 100) : 0;
  const toDatePct   = proj && proj.sanctionedHours > 0 ? Math.round((proj.hoursToDate    / proj.sanctionedHours) * 100) : 0;

  return (
    <div className="page" data-screen-label="Projects">
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="page-sub">{projects.length} projects</div>
        </div>
        <div className="page-actions">
          {canEdit && <button className="btn primary" onClick={() => setShowModal(true)}>+ New project</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, height: "calc(100vh - 180px)" }}>
        {/* Sidebar list */}
        <div className="card" style={{ overflow: "auto" }}>
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => selectProject(p)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                cursor: "pointer", borderRadius: 6,
                background: selected?.id === p.id ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.code}</div>
              </div>
              <span className={`chip chip-${STATUS_COLORS[p.status]}`} style={{ marginLeft: "auto", fontSize: 10 }}>
                {p.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {proj ? (
          <div className="card" style={{ overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: proj.color, marginTop: 4 }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600 }}>{proj.name}</h2>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                  {proj.code} {proj.clientName && `· ${proj.clientName}`}
                  {proj.startDate && ` · ${new Date(proj.startDate).toLocaleDateString()}`}
                  {proj.endDate && ` → ${new Date(proj.endDate).toLocaleDateString()}`}
                </div>
              </div>
              {canEdit && (
                <button className="btn sm" style={{ color: "var(--bad)" }} onClick={() => handleDelete(proj.id)}>Delete</button>
              )}
            </div>

            {/* Hours stats */}
            <div className="kpis" style={{ marginBottom: 20 }}>
              <div className="kpi">
                <div className="kpi-label">Sanctioned</div>
                <div className="kpi-value">{proj.sanctionedHours}<span className="unit">h</span></div>
              </div>
              <div className={`kpi ${usedPct > 100 ? "bad" : usedPct >= 80 ? "warn" : ""}`}>
                <div className="kpi-label">Consumed</div>
                <div className="kpi-value">{proj.consumedHours}<span className="unit">h</span></div>
                <div className="kpi-meta"><span className="chip">{usedPct}%</span> used</div>
              </div>
              <div className={`kpi ${remaining < 0 ? "bad" : ""}`}>
                <div className="kpi-label">Remaining</div>
                <div className="kpi-value">{remaining}<span className="unit">h</span></div>
              </div>
              <div className={`kpi ${allocPct > 100 ? "bad" : allocPct >= 80 ? "warn" : ""}`}>
                <div className="kpi-label">Allocated</div>
                <div className="kpi-value">{proj.allocatedHours}<span className="unit">h</span></div>
                <div className="kpi-meta"><span className="chip">{allocPct}%</span> of sanctioned · {proj._count.allocations} allocation{proj._count.allocations !== 1 ? "s" : ""}</div>
              </div>
              <div
                className="kpi"
                style={{ cursor: proj.engineerBreakdown.length > 0 ? "pointer" : "default", userSelect: "none" }}
                onClick={() => proj.engineerBreakdown.length > 0 && setShowBreakdown((v) => !v)}
                title={proj.engineerBreakdown.length > 0 ? "Click to see per-engineer breakdown" : undefined}
              >
                <div className="kpi-label">Hours to Date</div>
                <div className="kpi-value">{proj.hoursToDate}<span className="unit">h</span></div>
                {proj.engineerBreakdown.length > 0 && (
                  <div className="kpi-meta">
                    {proj.sanctionedHours > 0 && <><span className="chip">{toDatePct}%</span>{" "}</>}
                    {showBreakdown ? "▲ hide" : "▼ by engineer"}
                  </div>
                )}
              </div>
            </div>

            {/* Per-engineer breakdown */}
            {showBreakdown && proj.engineerBreakdown.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Engineer Breakdown</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left",  padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Engineer</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>To Date</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Total Allocated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proj.engineerBreakdown.map((e) => (
                      <tr key={e.userId} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                        <td style={{ padding: "7px 8px" }}>{e.userName ?? "Unknown"}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{e.hoursToDate}h</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{e.totalAllocated}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tasks */}
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Tasks</div>
            {proj.tasks.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No tasks yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Task</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Est. hours</th>
                  </tr>
                </thead>
                <tbody>
                  {proj.tasks.map((t) => (
                    <>
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                        <td style={{ padding: "7px 8px" }}>{t.name}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{t.estimatedHours}h</td>
                      </tr>
                      {t.subtasks.map((s) => (
                        <tr key={s.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                          <td style={{ padding: "5px 8px 5px 24px", color: "var(--text-secondary)", fontSize: 12 }}>↳ {s.name}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.estimatedHours}h</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            Select a project to view details
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h2>New Project</h2>
              <button className="iconbtn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Project name</span>
                  <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
                </label>
                <label className="field">
                  <span>Code</span>
                  <input value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} required maxLength={20} />
                </label>
                <label className="field">
                  <span>Client</span>
                  <input value={form.clientName} onChange={(e) => setForm((s) => ({ ...s, clientName: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Sanctioned hours</span>
                  <input type="number" min={0} value={form.sanctionedHours} onChange={(e) => setForm((s) => ({ ...s, sanctionedHours: Number(e.target.value) }))} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))} />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((s) => ({ ...s, endDate: e.target.value }))} />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Color</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setForm((s) => ({ ...s, color: c }))}
                        style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: form.color === c ? "3px solid var(--text)" : "2px solid transparent", cursor: "pointer" }} />
                    ))}
                  </div>
                </label>
              </div>
              <div className="modal-foot" style={{ marginTop: 16 }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? "Creating…" : "Create project"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


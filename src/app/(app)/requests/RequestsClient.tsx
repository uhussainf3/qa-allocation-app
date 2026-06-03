"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

type Request = {
  id: string; title: string; description: string | null; priority: string; status: string;
  hoursPerWeek: number; startDate: string | null; duration: number | null;
  project: { id: string; name: string; code: string } | null;
  requestedBy: { id: string; name: string | null };
  assignedTo: { id: string; name: string | null } | null;
};
type Project = { id: string; name: string; code: string };
type User = { id: string; name: string | null; role: Role };

const PRI_COLOR: Record<string, string> = { CRITICAL: "bad", HIGH: "warn", MEDIUM: "ok", LOW: "idle" };

interface Props { requests: Request[]; projects: Project[]; users: User[]; canReview: boolean; }

export function RequestsClient({ requests, projects, users, canReview }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", projectId: "", hoursPerWeek: 20, priority: "MEDIUM", description: "", startDate: "" });
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowModal(false); window.location.reload();
    } finally { setSaving(false); }
  }

  async function handleReview(requestId: string, action: "approve" | "decline") {
    await fetch("/api/requests", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, assignedToId: assignMap[requestId] }),
    });
    window.location.reload();
  }

  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="page" data-screen-label="Requests">
      <div className="page-head">
        <div><h1 className="page-title">Resource Requests</h1><div className="page-sub">{pending} pending</div></div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowModal(true)}>+ New request</button>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 20 }}>
        {["PENDING", "APPROVED", "DECLINED"].map((s) => (
          <div key={s} className={`kpi ${s === "PENDING" && pending > 0 ? "warn" : ""}`}>
            <div className="kpi-label">{s.charAt(0) + s.slice(1).toLowerCase()}</div>
            <div className="kpi-value">{requests.filter((r) => r.status === s).length}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {requests.map((r) => (
          <div key={r.id} className="card" style={{ borderLeft: `4px solid var(--${PRI_COLOR[r.priority]})` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {r.project?.name ?? "No project"} · {r.hoursPerWeek}h/wk · by {r.requestedBy.name}
                  {r.startDate && ` · from ${new Date(r.startDate).toLocaleDateString()}`}
                  {r.duration && ` · ${r.duration}w`}
                </div>
                {r.description && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>{r.description}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className={`chip chip-${PRI_COLOR[r.priority]}`}>{r.priority}</span>
                <span className={`chip chip-${r.status === "APPROVED" ? "ok" : r.status === "DECLINED" ? "bad" : "warn"}`}>{r.status}</span>
              </div>
            </div>
            {r.assignedTo && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Assigned to: {r.assignedTo.name}</div>}
            {canReview && r.status === "PENDING" && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={assignMap[r.id] ?? ""}
                  onChange={(e) => setAssignMap((s) => ({ ...s, [r.id]: e.target.value }))}
                  style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4 }}
                >
                  <option value="">Assign to…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn sm" style={{ color: "var(--ok)" }} onClick={() => handleReview(r.id, "approve")}>Approve</button>
                <button className="btn sm" style={{ color: "var(--bad)" }} onClick={() => handleReview(r.id, "decline")}>Decline</button>
              </div>
            )}
          </div>
        ))}
        {requests.length === 0 && <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No requests yet.</div>}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>New Resource Request</h2><button className="iconbtn" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleCreate} className="modal-body">
              <label className="field"><span>Title</span><input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} required /></label>
              <label className="field"><span>Project</span>
                <select value={form.projectId} onChange={(e) => setForm((s) => ({ ...s, projectId: e.target.value }))}>
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field"><span>Hours/week</span><input type="number" min={1} max={80} value={form.hoursPerWeek} onChange={(e) => setForm((s) => ({ ...s, hoursPerWeek: Number(e.target.value) }))} /></label>
                <label className="field"><span>Priority</span>
                  <select value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                    <option value="CRITICAL">Critical</option><option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option><option value="LOW">Low</option>
                  </select>
                </label>
                <label className="field"><span>Start date</span><input type="date" value={form.startDate} onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))} /></label>
              </div>
              <label className="field"><span>Description</span><textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={3} style={{ resize: "vertical" }} /></label>
              <div className="modal-foot">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


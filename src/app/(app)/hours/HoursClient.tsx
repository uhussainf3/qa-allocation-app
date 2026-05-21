"use client";

import { useState } from "react";

type Project = { id: string; name: string; code: string; color: string };
type Log = { id: string; projectId: string; date: string; hours: number; notes: string | null; status: string; project: { id: string; name: string; color: string } };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

interface Props { projects: Project[]; logs: Log[]; weekStart: string; }

export function HoursClient({ projects, logs, weekStart }: Props) {
  const [form, setForm] = useState({ projectId: "", date: new Date(weekStart).toISOString().slice(0, 10), hours: 8, notes: "" });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const monday = new Date(weekStart);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    return d;
  });

  const totalHours = logs.reduce((s, l) => s + l.hours, 0);
  const hasDraft = logs.some((l) => l.status === "DRAFT");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await fetch("/api/hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      window.location.reload();
    } finally { setSaving(false); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/timesheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart }) });
      window.location.reload();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="page" data-screen-label="Hours log">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hours log</h1>
          <div className="page-sub">Week of {monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
        </div>
        <div className="page-actions">
          <div className="kpi" style={{ textAlign: "right" }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{totalHours}</span>
            <span className="unit" style={{ fontSize: 13 }}>h logged</span>
          </div>
          {hasDraft && (
            <button className="btn primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit week"}
            </button>
          )}
        </div>
      </div>

      {/* Day tabs */}
      <div className="row" style={{ gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {days.map((d, i) => {
          const iso = d.toISOString().slice(0, 10);
          const dayLogs = logs.filter((l) => l.date.slice(0, 10) === iso);
          const dayH = dayLogs.reduce((s, l) => s + l.hours, 0);
          return (
            <button
              key={iso}
              onClick={() => setForm((s) => ({ ...s, date: iso }))}
              style={{
                padding: "10px 20px", border: "none", background: form.date === iso ? "var(--accent-soft)" : "transparent",
                borderBottom: form.date === iso ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer", fontSize: 13, fontWeight: 500, color: form.date === iso ? "var(--accent)" : "var(--text-secondary)"
              }}
            >
              {DAYS[i]} <span style={{ fontSize: 11, opacity: 0.7 }}>{dayH > 0 ? `${dayH}h` : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Today's logs */}
      <div className="card" style={{ marginBottom: 16 }}>
        {logs.filter((l) => l.date.slice(0, 10) === form.date).map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.project.color }} />
            <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{l.project.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{l.hours}h</span>
            {l.notes && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.notes}</span>}
            <span className={`chip chip-${l.status === "APPROVED" ? "ok" : l.status === "SUBMITTED" ? "warn" : "idle"}`} style={{ fontSize: 10 }}>
              {l.status}
            </span>
          </div>
        ))}
        {logs.filter((l) => l.date.slice(0, 10) === form.date).length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 0" }}>No hours logged for this day.</p>
        )}
      </div>

      {/* Log form */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Log hours</div>
        <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "end" }}>
          <label className="field">
            <span>Project</span>
            <select value={form.projectId} onChange={(e) => setForm((s) => ({ ...s, projectId: e.target.value }))} required>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Optional note…" />
          </label>
          <label className="field">
            <span>Hours</span>
            <input type="number" min={0.5} max={24} step={0.5} value={form.hours} onChange={(e) => setForm((s) => ({ ...s, hours: Number(e.target.value) }))} style={{ width: 80 }} required />
          </label>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? "Adding…" : "Add"}</button>
        </form>
      </div>
    </div>
  );
}

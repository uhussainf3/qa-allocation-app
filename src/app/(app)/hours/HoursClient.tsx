"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getMondayOf } from "@/lib/weeks";

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = { id: string; name: string; code: string; color: string };
type TaskOption = { id: string; name: string; status: string };
type Log = {
  id: string;
  projectId: string;
  taskId: string | null;
  date: string;
  hours: number;
  notes: string | null;
  status: string;
  project: { id: string; name: string; color: string };
  task:    { id: string; name: string } | null;
};

interface Props {
  projects: Project[];
  logs: Log[];
  weekStart: string; // ISO string of the Monday
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ─── Component ────────────────────────────────────────────────────────────────

export function HoursClient({ projects, logs, weekStart }: Props) {
  const router  = useRouter();
  const monday  = new Date(weekStart);
  const refresh = useCallback(() => router.refresh(), [router]);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    projectId: "",
    taskId:    "",
    date:      monday.toISOString().slice(0, 10),
    hours:     8,
    notes:     "",
  });
  const [saving,       setSaving]       = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editHours,    setEditHours]    = useState(0);
  const [editNotes,    setEditNotes]    = useState("");
  const [editSaving,   setEditSaving]   = useState(false);
  // Task picker
  const [taskOptions,  setTaskOptions]  = useState<TaskOption[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    return d;
  });

  const totalHours      = logs.reduce((s, l) => s + l.hours, 0);
  const hasDraft        = logs.some((l) => l.status === "DRAFT");
  const selectedDayLogs = logs.filter((l) => l.date.slice(0, 10) === form.date);

  function isCurrentWeek() {
    const thisMonday = getMondayOf(new Date());
    return monday.toISOString().slice(0, 10) === thisMonday.toISOString().slice(0, 10);
  }

  // ── Task loader ───────────────────────────────────────────────────────────────
  async function loadTasksForProject(projectId: string) {
    if (!projectId) { setTaskOptions([]); return; }
    setTasksLoading(true);
    try {
      const res  = await fetch(`/api/tasks?projectId=${projectId}`);
      const json = await res.json();
      // Flatten top-level + subtasks, exclude DONE tasks
      const all: TaskOption[] = [];
      for (const t of (json.data ?? json)) {
        if (t.status !== "DONE") all.push({ id: t.id, name: t.name, status: t.status });
        for (const st of t.subtasks ?? []) {
          if (st.status !== "DONE") all.push({ id: st.id, name: `↳ ${st.name}`, status: st.status });
        }
      }
      setTaskOptions(all);
    } catch {
      setTaskOptions([]);
    } finally {
      setTasksLoading(false);
    }
  }

  // ── Week navigation ──────────────────────────────────────────────────────────
  function navWeek(dir: -1 | 1) {
    const d = new Date(monday); d.setDate(d.getDate() + dir * 7);
    router.push(`?week=${d.toISOString().slice(0, 10)}`);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/hours", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...form,
          taskId: form.taskId || null,
        }),
      });
      setForm((s) => ({ ...s, projectId: "", taskId: "", notes: "", hours: 8 }));
      setTaskOptions([]);
      refresh();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this log entry?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/hours/${id}`, { method: "DELETE" });
      refresh();
    } finally { setDeletingId(null); }
  }

  function openEdit(log: Log) {
    setEditId(log.id);
    setEditHours(log.hours);
    setEditNotes(log.notes ?? "");
  }

  async function handleEditSave() {
    if (!editId) return;
    setEditSaving(true);
    try {
      await fetch(`/api/hours/${editId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hours: editHours, notes: editNotes }),
      });
      setEditId(null);
      refresh();
    } finally { setEditSaving(false); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/timesheets", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ weekStart }),
      });
      refresh();
    } finally { setSubmitting(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page" data-screen-label="Hours log">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Hours log</h1>
          <div className="page-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Week of {monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {isCurrentWeek() && (
              <span className="chip" style={{ fontSize: 10 }}>Current week</span>
            )}
          </div>
        </div>
        <div className="page-actions">
          {/* Week nav */}
          <div className="seg">
            <button onClick={() => navWeek(-1)}>← Prev</button>
            <button onClick={() => navWeek(1)} disabled={isCurrentWeek()}>Next →</button>
          </div>

          {/* Hours KPI */}
          <div className="kpi" style={{ textAlign: "right", padding: "0 8px" }}>
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

      {/* ── Day tabs ────────────────────────────────────────────────────────── */}
      <div className="row" style={{ gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {days.map((d, i) => {
          const iso    = d.toISOString().slice(0, 10);
          const dayH   = logs.filter((l) => l.date.slice(0, 10) === iso).reduce((s, l) => s + l.hours, 0);
          const active = form.date === iso;
          return (
            <button
              key={iso}
              onClick={() => setForm((s) => ({ ...s, date: iso }))}
              style={{
                padding:      "10px 20px",
                border:       "none",
                background:   active ? "var(--accent-soft)" : "transparent",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                cursor:       "pointer",
                fontSize:     13,
                fontWeight:   500,
                color:        active ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {DAYS[i]}
              {dayH > 0 && (
                <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{dayH}h</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Logs for selected day ────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        {selectedDayLogs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 0", margin: 0 }}>
            No hours logged for this day.
          </p>
        ) : (
          selectedDayLogs.map((l) =>
            editId === l.id ? (
              /* ── Inline edit row ── */
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-faint)", flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.project.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{l.project.name}</span>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: 11 }}>Hours</span>
                  <input
                    type="number" min={0.5} max={24} step={0.5}
                    value={editHours}
                    onChange={(e) => setEditHours(Number(e.target.value))}
                    style={{ width: 70 }}
                    autoFocus
                  />
                </label>
                <label className="field" style={{ margin: 0, flex: "0 0 200px" }}>
                  <span style={{ fontSize: 11 }}>Notes</span>
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Optional note…"
                  />
                </label>
                <div style={{ display: "flex", gap: 6, paddingTop: 18 }}>
                  <button className="btn primary" style={{ fontSize: 12 }} onClick={handleEditSave} disabled={editSaving}>
                    {editSaving ? "…" : "Save"}
                  </button>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Normal row ── */
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.project.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{l.project.name}</div>
                  {l.task && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.task.name}
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{l.hours}h</span>
                {l.notes && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.notes}</span>
                )}
                <span className={`chip chip-${l.status === "APPROVED" ? "ok" : l.status === "SUBMITTED" ? "warn" : "idle"}`} style={{ fontSize: 10 }}>
                  {l.status}
                </span>
                {l.status === "DRAFT" && (
                  <>
                    <button
                      className="iconbtn"
                      title="Edit"
                      style={{ fontSize: 13 }}
                      onClick={() => openEdit(l)}
                    >
                      ✎
                    </button>
                    <button
                      className="iconbtn"
                      title="Delete"
                      style={{ fontSize: 13, color: "var(--bad)", opacity: deletingId === l.id ? 0.4 : 0.8 }}
                      onClick={() => handleDelete(l.id)}
                      disabled={deletingId === l.id}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            )
          )
        )}
      </div>

      {/* ── Add form ────────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Log hours</div>
        <form
          onSubmit={handleAdd}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}
        >
          {/* Project */}
          <label className="field">
            <span>Project</span>
            <select
              value={form.projectId}
              onChange={(e) => {
                const pid = e.target.value;
                setForm((s) => ({ ...s, projectId: pid, taskId: "" }));
                loadTasksForProject(pid);
              }}
              required
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {/* Task (shown once project is selected) */}
          <label className="field">
            <span>Task {tasksLoading && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(loading…)</span>}</span>
            <select
              value={form.taskId}
              onChange={(e) => setForm((s) => ({ ...s, taskId: e.target.value }))}
              disabled={!form.projectId || tasksLoading}
            >
              <option value="">— no specific task —</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Optional note…"
            />
          </label>
          <label className="field">
            <span>Hours</span>
            <input
              type="number" min={0.5} max={24} step={0.5}
              value={form.hours}
              onChange={(e) => setForm((s) => ({ ...s, hours: Number(e.target.value) }))}
              style={{ width: 80 }}
              required
            />
          </label>
          <div style={{ paddingTop: 18 }}>
            <button type="submit" className="btn primary" style={{ width: "100%" }} disabled={saving}>
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}

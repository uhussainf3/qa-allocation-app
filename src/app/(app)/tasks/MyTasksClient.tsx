"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface MyTask {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  project: Project;
  parentId: string | null;
  status: string;
  priority: string;
  estimatedHours: number;
  dueDate: string | null;
  jiraKey: string | null;
  actualHours: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS  = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const STATUS_LABELS: Record<string, string> = {
  TODO:        "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW:   "In Review",
  DONE:        "Done",
  BLOCKED:     "Blocked",
};

const STATUS_COLORS: Record<string, string> = {
  TODO:        "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  IN_REVIEW:   "#8b5cf6",
  DONE:        "#22c55e",
  BLOCKED:     "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW:      "#94a3b8",
  MEDIUM:   "#f59e0b",
  HIGH:     "#f97316",
  CRITICAL: "#ef4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate) < new Date();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MyTasksClient() {
  const router = useRouter();

  const [tasks, setTasks]           = useState<MyTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Filters
  const [filterProject,  setFilterProject]  = useState("ALL");
  const [filterStatus,   setFilterStatus]   = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [search,         setSearch]         = useState("");

  // Inline status update
  const [patchingId, setPatchingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/my");
      if (!res.ok) throw new Error("Failed to load tasks");
      const json = await res.json();
      setTasks(json.data ?? json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── Inline status patch ──────────────────────────────────────────────────

  async function patchStatus(taskId: string, status: string) {
    setPatchingId(taskId);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setPatchingId(null);
    loadTasks();
    router.refresh();
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  // Unique projects from task list
  const projects = Array.from(
    new Map(tasks.map((t) => [t.project.id, t.project])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Apply filters
  const filtered = tasks.filter((t) => {
    if (filterProject  !== "ALL" && t.project.id !== filterProject)  return false;
    if (filterStatus   !== "ALL" && t.status     !== filterStatus)   return false;
    if (filterPriority !== "ALL" && t.priority   !== filterPriority) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.project.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const stats = {
    total:      tasks.length,
    todo:       tasks.filter((t) => t.status === "TODO").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    inReview:   tasks.filter((t) => t.status === "IN_REVIEW").length,
    done:       tasks.filter((t) => t.status === "DONE").length,
    blocked:    tasks.filter((t) => t.status === "BLOCKED").length,
    overdue:    tasks.filter((t) => isOverdue(t.dueDate, t.status)).length,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>My Tasks</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            All tasks assigned to you, across every project
          </p>
        </div>
        <button className="btn-primary" onClick={loadTasks} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total",       value: stats.total,      color: "var(--text-muted)" },
          { label: "To Do",       value: stats.todo,       color: STATUS_COLORS.TODO        },
          { label: "In Progress", value: stats.inProgress, color: STATUS_COLORS.IN_PROGRESS },
          { label: "In Review",   value: stats.inReview,   color: STATUS_COLORS.IN_REVIEW   },
          { label: "Done",        value: stats.done,       color: STATUS_COLORS.DONE        },
          { label: "Blocked",     value: stats.blocked,    color: STATUS_COLORS.BLOCKED     },
          { label: "Overdue",     value: stats.overdue,    color: "#ef4444"                 },
        ].map((tile) => (
          <div key={tile.label} className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: tile.color }}>{tile.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search tasks or projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 200px", minWidth: 160, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
          />

          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{ flex: "1 1 160px", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
          >
            <option value="ALL">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ flex: "1 1 140px", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
          >
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={{ flex: "1 1 140px", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
          >
            <option value="ALL">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
            ))}
          </select>

          {(filterProject !== "ALL" || filterStatus !== "ALL" || filterPriority !== "ALL" || search) && (
            <button
              onClick={() => { setFilterProject("ALL"); setFilterStatus("ALL"); setFilterPriority("ALL"); setSearch(""); }}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Task list */}
      {loading && tasks.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          Loading tasks…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          {tasks.length === 0 ? "No tasks assigned to you yet." : "No tasks match the current filters."}
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-raised, var(--surface))" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "35%" }}>Task</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "16%" }}>Project</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "14%" }}>Status</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "10%" }}>Priority</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "12%" }}>Due date</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", width: "13%" }}>Hours (est/act)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, idx) => {
                const overdue   = isOverdue(task.dueDate, task.status);
                const overBudget = task.estimatedHours > 0 && task.actualHours > task.estimatedHours;

                return (
                  <tr
                    key={task.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
                      background: "transparent",
                    }}
                  >
                    {/* Task name */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontWeight: 500, color: task.status === "DONE" ? "var(--text-muted)" : "var(--text)", textDecoration: task.status === "DONE" ? "line-through" : "none" }}>
                          {task.parentId && <span style={{ color: "var(--text-muted)", marginRight: 4 }}>↳</span>}
                          {task.name}
                        </span>
                        {task.jiraKey && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{task.jiraKey}</span>
                        )}
                        {task.description && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                            {task.description}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Project badge */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: task.project.color, flexShrink: 0 }} />
                        <span style={{ color: "var(--text)" }}>{task.project.code}</span>
                      </span>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{task.project.name}</div>
                    </td>

                    {/* Status (inline editable) */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                      <select
                        value={task.status}
                        disabled={patchingId === task.id}
                        onChange={(e) => patchStatus(task.id, e.target.value)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 6px",
                          borderRadius: 12,
                          border: "none",
                          background: STATUS_COLORS[task.status] + "22",
                          color: STATUS_COLORS[task.status],
                          cursor: "pointer",
                          appearance: "auto",
                        }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>

                    {/* Priority dot */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />
                        <span style={{ color: "var(--text-muted)" }}>
                          {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                        </span>
                      </span>
                    </td>

                    {/* Due date */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                      <span style={{ fontSize: 12, color: overdue ? "#ef4444" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                        {overdue && "⚠ "}
                        {fmtDate(task.dueDate)}
                      </span>
                    </td>

                    {/* Hours */}
                    <td style={{ padding: "12px 16px", verticalAlign: "top", textAlign: "right" }}>
                      <span style={{ fontSize: 12, color: overBudget ? "#ef4444" : "var(--text-muted)", fontWeight: overBudget ? 600 : 400 }}>
                        {overBudget && "⚠ "}
                        {task.estimatedHours > 0 ? task.estimatedHours : "—"}
                        {" / "}
                        {task.actualHours > 0 ? task.actualHours : "0"}h
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Results count */}
      {!loading && tasks.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>
          Showing {filtered.length} of {tasks.length} tasks
        </div>
      )}
    </div>
  );
}

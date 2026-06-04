"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

type JobTitle = { id: string; name: string };

interface Props {
  initialJobTitles: JobTitle[];
  currentUserRole:  Role;
}

export function JobTitlesClient({ initialJobTitles, currentUserRole }: Props) {
  const [jobTitles, setJobTitles] = useState<JobTitle[]>(initialJobTitles);
  const [newName,   setNewName]   = useState("");
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const isAdmin = currentUserRole === "ADMIN";

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/job-titles", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setJobTitles((prev) =>
          [...prev, data.jobTitle].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNewName("");
      } else {
        setError(data.error ?? "Failed to add job title");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Edit (inline) ────────────────────────────────────────────────────────────

  function startEdit(jt: JobTitle) {
    setEditId(jt.id);
    setEditName(jt.name);
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setError("");
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/job-titles/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setJobTitles((prev) =>
          prev
            .map((j) => (j.id === id ? { ...j, name: data.jobTitle.name } : j))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditId(null);
      } else {
        setError(data.error ?? "Failed to update job title");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/job-titles/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      setJobTitles((prev) => prev.filter((j) => j.id !== id));
    } else {
      setError(data.error ?? "Failed to delete job title");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Job Titles</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        Defines the list available when assigning roles to team members.
        {!isAdmin && " (View only — Admin access required to make changes.)"}
      </div>

      {/* Add form */}
      {isAdmin && (
        <form
          onSubmit={handleAdd}
          style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}
        >
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>New Job Title</span>
            <input
              placeholder="e.g. Senior Developer"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="btn primary"
            disabled={saving || !newName.trim()}
            style={{ flexShrink: 0 }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {error && (
        <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      {/* List */}
      {jobTitles.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No job titles configured yet.{isAdmin ? " Add one above." : ""}
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>
                Name
              </th>
              {isAdmin && <th style={{ width: 160 }} />}
            </tr>
          </thead>
          <tbody>
            {jobTitles.map((jt) => (
              <tr key={jt.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                <td style={{ padding: "8px 8px" }}>
                  {editId === jt.id ? (
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")  { e.preventDefault(); handleSaveEdit(jt.id); }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      style={{ width: "100%", padding: "4px 8px", fontSize: 13 }}
                    />
                  ) : (
                    <span>{jt.name}</span>
                  )}
                </td>
                {isAdmin && (
                  <td style={{ padding: "8px 8px", textAlign: "right" }}>
                    {editId === jt.id ? (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="btn sm primary"
                          onClick={() => handleSaveEdit(jt.id)}
                          disabled={saving || !editName.trim()}
                        >
                          Save
                        </button>
                        <button className="btn sm" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => startEdit(jt)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm"
                          style={{ color: "var(--bad)" }}
                          onClick={() => handleDelete(jt.id, jt.name)}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

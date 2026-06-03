"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DivisionUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type Division = {
  id:          string;
  name:        string;
  code:        string;
  color:       string;
  description: string | null;
  ownerId:     string | null;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  owner:       DivisionUser | null;
  _count:      { members: number; projects: number };
};

type UserOption = {
  id:    string;
  name:  string | null;
  email: string | null;
};

interface Props {
  divisions: Division[];
  users:     UserOption[];
}

// ─── Colour swatches ──────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#84cc16",
];

const EMPTY_FORM = { name: "", code: "", color: "#6366f1", description: "", ownerId: "" };

// ─── Component ────────────────────────────────────────────────────────────────

export function DivisionsClient({ divisions: initial, users }: Props) {
  const router            = useRouter();
  const [isPending, startTransition] = useTransition();
  const [divisions, setDivisions]    = useState<Division[]>(initial);
  const [showModal, setShowModal]    = useState(false);
  const [editTarget, setEditTarget]  = useState<Division | null>(null);
  const [form, setForm]              = useState(EMPTY_FORM);
  const [saving, setSaving]          = useState(false);
  const [error, setError]            = useState<string | null>(null);

  // ── Open create/edit modal
  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }
  function openEdit(d: Division) {
    setEditTarget(d);
    setForm({ name: d.name, code: d.code, color: d.color, description: d.description ?? "", ownerId: d.ownerId ?? "" });
    setError(null);
    setShowModal(true);
  }

  // ── Save (create or update)
  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      setError("Name and code are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url    = editTarget ? `/api/divisions/${editTarget.id}` : "/api/divisions";
      const method = editTarget ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name.trim(),
          code:        form.code.trim().toUpperCase(),
          color:       form.color,
          description: form.description.trim() || null,
          ownerId:     form.ownerId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "An error occurred"); return; }

      setShowModal(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active
  async function toggleActive(d: Division) {
    const res = await fetch(`/api/divisions/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !d.isActive }),
    });
    if (res.ok) {
      setDivisions((prev) => prev.map((x) => x.id === d.id ? { ...x, isActive: !d.isActive } : x));
      startTransition(() => router.refresh());
    }
  }

  // ── Delete
  async function handleDelete(d: Division) {
    if (!confirm(`Delete division "${d.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/divisions/${d.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { alert(json.error ?? "Cannot delete"); return; }
    setDivisions((prev) => prev.filter((x) => x.id !== d.id));
    startTransition(() => router.refresh());
  }

  const totalMembers  = divisions.reduce((s, d) => s + d._count.members,  0);
  const totalProjects = divisions.reduce((s, d) => s + d._count.projects, 0);
  const activeCount   = divisions.filter((d) => d.isActive).length;

  return (
    <div className="page" data-screen-label="Divisions">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Divisions</h1>
          <div className="page-sub">{divisions.length} division{divisions.length !== 1 ? "s" : ""} · {activeCount} active</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Division</button>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi ok">
          <div className="kpi-label">Divisions</div>
          <div className="kpi-value">{divisions.length}</div>
          <div className="kpi-meta">{activeCount} active</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Members</div>
          <div className="kpi-value">{totalMembers}</div>
          <div className="kpi-meta">Across all divisions</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Projects</div>
          <div className="kpi-value">{totalProjects}</div>
          <div className="kpi-meta">Across all divisions</div>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {divisions.map((d) => (
          <div
            key={d.id}
            className="card"
            style={{ padding: 20, opacity: d.isActive ? 1 : 0.6, position: "relative", borderLeft: `4px solid ${d.color}` }}
          >
            {/* Color badge + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 8,
                background: d.color, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {d.code}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                {!d.isActive && <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--surface-2)", padding: "1px 6px", borderRadius: 10 }}>INACTIVE</span>}
              </div>
            </div>

            {d.description && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{d.description}</div>
            )}

            {/* Stats */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
              <span><strong>{d._count.members}</strong> member{d._count.members !== 1 ? "s" : ""}</span>
              <span><strong>{d._count.projects}</strong> project{d._count.projects !== 1 ? "s" : ""}</span>
            </div>

            {/* Owner */}
            {d.owner && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Owner: <strong style={{ color: "var(--text)" }}>{d.owner.name ?? d.owner.email}</strong>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => openEdit(d)}>Edit</button>
              <button
                className="btn btn-sm"
                onClick={() => toggleActive(d)}
                style={{ color: d.isActive ? "var(--warn)" : "var(--ok)" }}
              >
                {d.isActive ? "Deactivate" : "Activate"}
              </button>
              {d._count.members === 0 && d._count.projects === 0 && (
                <button
                  className="btn btn-sm"
                  onClick={() => handleDelete(d)}
                  style={{ color: "var(--danger, #ef4444)", marginLeft: "auto" }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}

        {divisions.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", gridColumn: "1/-1" }}>
            No divisions yet. Create your first division to get started.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="card" style={{ width: 480, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
              {editTarget ? "Edit Division" : "New Division"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Name *</div>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. NetSuite Division"
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Code * <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(short, unique)</span></div>
                <input
                  className="input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().slice(0, 10) })}
                  placeholder="e.g. NS"
                  style={{ width: "100%", textTransform: "uppercase" }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Description</div>
                <textarea
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                  rows={2}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </label>

              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Colour</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: 28, height: 28, borderRadius: "50%", background: c, border: "none",
                        cursor: "pointer", outline: form.color === c ? "3px solid white" : "none",
                        boxShadow: form.color === c ? `0 0 0 5px ${c}55` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Division Owner</div>
                <select
                  className="input"
                  value={form.ownerId}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  style={{ width: "100%" }}
                >
                  <option value="">— None —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>

            {error && (
              <div style={{ marginTop: 14, color: "var(--danger, #ef4444)", fontSize: 13 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Create Division"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPending && null}
    </div>
  );
}

"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DivisionRef = { id: string; name: string; code: string; color: string };
type JobTitleRef = { id: string; name: string };

type TeamMember = {
  id:         string;
  name:       string | null;
  email:      string | null;
  image:      string | null;
  role:       string;
  jobTitle:   string | null;
  capacity:   number;
  department: string | null;
  isActive:   boolean;
  isOnshore:  boolean;
  divisionId: string | null;
  managerId:  string | null;
  createdAt:  string;
  division:   DivisionRef | null;
};

interface Props {
  users:     TeamMember[];
  divisions: DivisionRef[];
  jobTitles: JobTitleRef[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER", "MEMBER"] as const;

const ROLE_LABELS: Record<string, string> = {
  ADMIN:           "Admin",
  EXECUTIVE:       "Executive",
  DIVISION_OWNER:  "Division Owner",
  PROJECT_MANAGER: "Project Manager",
  MEMBER:          "Member",
};

const EMPTY_FORM = {
  name: "", email: "", role: "MEMBER" as string,
  jobTitle: "", capacity: 40, department: "",
  divisionId: "", managerId: "", isActive: true, isOnshore: false,
};

function initials(name: string | null, email: string | null) {
  return (name ?? email ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamClient({ users: initial, divisions, jobTitles }: Props) {
  const pmOptions = useMemo(
    () => initial
      .filter((u) => u.isActive && (u.role === "PROJECT_MANAGER" || u.role === "DIVISION_OWNER"))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [initial]
  );
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [users, setUsers]            = useState<TeamMember[]>(initial);
  const [showModal, setShowModal]    = useState(false);
  const [editTarget, setEditTarget]  = useState<TeamMember | null>(null);
  const [form, setForm]              = useState({ ...EMPTY_FORM });
  const [saving, setSaving]          = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const [search, setSearch]          = useState("");
  const [filterDiv, setFilterDiv]    = useState("");
  const [filterRole, setFilterRole]  = useState("");
  const [filterActive, setFilterActive] = useState<"active" | "inactive" | "all">("active");

  // ── Filtered list
  const filtered = useMemo(() => {
    let list = users;
    if (filterActive === "active")   list = list.filter((u) => u.isActive);
    if (filterActive === "inactive") list = list.filter((u) => !u.isActive);
    if (filterDiv)  list = list.filter((u) => u.divisionId === filterDiv);
    if (filterRole) list = list.filter((u) => u.role === filterRole);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [users, filterDiv, filterRole, filterActive, search]);

  // ── KPIs
  const active    = users.filter((u) => u.isActive).length;
  const inactive  = users.filter((u) => !u.isActive).length;
  const withDiv   = users.filter((u) => u.divisionId && u.isActive).length;
  const noDivPct  = active > 0 ? Math.round(((active - withDiv) / active) * 100) : 0;

  // ── Modal helpers
  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setShowModal(true);
  }
  function openEdit(u: TeamMember) {
    setEditTarget(u);
    setForm({
      name: u.name ?? "", email: u.email ?? "",
      role: u.role, jobTitle: u.jobTitle ?? "",
      capacity: u.capacity, department: u.department ?? "",
      divisionId: u.divisionId ?? "", managerId: u.managerId ?? "", isActive: u.isActive, isOnshore: u.isOnshore,
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!editTarget && !form.email.trim()) { setError("Email is required for new users."); return; }
    setSaving(true);
    setError(null);
    try {
      const url    = editTarget ? `/api/users/${editTarget.id}` : "/api/users";
      const method = editTarget ? "PATCH" : "POST";
      const payload: Record<string, unknown> = {
        name:       form.name.trim(),
        role:       form.role,
        jobTitle:   form.jobTitle || null,
        capacity:   form.capacity,
        department: form.department.trim() || null,
        divisionId: form.divisionId || null,
        managerId:  form.managerId  || null,
        isActive:   form.isActive,
        isOnshore:  form.isOnshore,
      };
      if (!editTarget) payload.email = form.email.trim();

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "An error occurred"); return; }

      if (editTarget) {
        const divRef = json.division ?? null;
        setUsers((prev) => prev.map((u) => u.id === editTarget.id
          ? { ...u, ...payload, division: divRef, divisionId: form.divisionId || null } as TeamMember
          : u
        ));
      } else {
        setUsers((prev) => [json as TeamMember, ...prev]);
      }
      setShowModal(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: TeamMember) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="page" data-screen-label="Team">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <div className="page-sub">{active} active · {inactive} inactive · {users.length} total</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Member</button>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi ok">
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{active}<span className="unit">people</span></div>
          <div className="kpi-meta">Currently active</div>
        </div>
        <div className="kpi warn">
          <div className="kpi-label">Inactive</div>
          <div className="kpi-value">{inactive}<span className="unit">people</span></div>
          <div className="kpi-meta">Deactivated accounts</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">In a Division</div>
          <div className="kpi-value">{withDiv}<span className="unit">people</span></div>
          <div className="kpi-meta">Of {active} active</div>
        </div>
        {noDivPct > 0 && (
          <div className="kpi warn">
            <div className="kpi-label">Unassigned</div>
            <div className="kpi-value">{active - withDiv}<span className="unit">people</span></div>
            <div className="kpi-meta">{noDivPct}% with no division</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 180 }}
        />
        <select className="input" value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">All Divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="NONE">No Division</option>
        </select>
        <select className="input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">All Roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select className="input" value={filterActive} onChange={(e) => setFilterActive(e.target.value as "active"|"inactive"|"all")} style={{ minWidth: 130 }}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            No members match the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  {["Member", "Division", "Role", "Job Title", "Capacity", "Status", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 5 ? "center" : "left", padding: "10px 14px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", opacity: u.isActive ? 1 : 0.55 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    {/* Member */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="avatar" style={{ flexShrink: 0, fontSize: 12 }}>{initials(u.name, u.email)}</span>
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name ?? "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Division */}
                    <td style={{ padding: "12px 14px" }}>
                      {u.division ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 9px", fontSize: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.division.color, flexShrink: 0 }} />
                          {u.division.code}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                      )}
                    </td>

                    {/* Role */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 12 }}>{ROLE_LABELS[u.role] ?? u.role}</span>
                    </td>

                    {/* Job Title */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{u.jobTitle || "—"}</span>
                    </td>

                    {/* Capacity */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 12 }}>{u.capacity}h/wk</span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 500,
                        background: u.isActive ? "rgba(34,197,94,.15)" : "var(--surface-2)",
                        color: u.isActive ? "var(--ok)" : "var(--text-muted)",
                      }}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => openEdit(u)}>Edit</button>
                        <button
                          className="btn btn-sm"
                          onClick={() => toggleActive(u)}
                          style={{ color: u.isActive ? "var(--warn)" : "var(--ok)" }}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="card" style={{ width: 500, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
              {editTarget ? "Edit Member" : "Add New Member"}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ fontSize: 13, gridColumn: "1/-1" }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Full Name *</div>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Smith" style={{ width: "100%" }} />
              </label>

              {!editTarget && (
                <label style={{ fontSize: 13, gridColumn: "1/-1" }}>
                  <div style={{ marginBottom: 4, fontWeight: 500 }}>Email *</div>
                  <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@folio3.com" style={{ width: "100%" }} />
                </label>
              )}

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>System Role</div>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ width: "100%" }}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Job Title</div>
                <select className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} style={{ width: "100%" }}>
                  <option value="">— None —</option>
                  {jobTitles.map((j) => <option key={j.id} value={j.name}>{j.name}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Division</div>
                <select className="input" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value })} style={{ width: "100%" }}>
                  <option value="">— None —</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                </select>
              </label>

              <label style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Capacity (h/wk)</div>
                <input className="input" type="number" min={1} max={60} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} style={{ width: "100%" }} />
              </label>

              <label style={{ fontSize: 13, gridColumn: "1/-1" }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Reports to (PM)</div>
                <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} style={{ width: "100%" }}>
                  <option value="">— None —</option>
                  {pmOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 13, gridColumn: "1/-1" }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Department</div>
                <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" style={{ width: "100%" }} />
              </label>

              {editTarget && (
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span>Active</span>
                </label>
              )}
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, gridColumn: "1/-1" }}>
                <input
                  type="checkbox"
                  checked={form.isOnshore}
                  onChange={(e) => setForm({ ...form, isOnshore: e.target.checked })}
                />
                <div>
                  <span style={{ fontWeight: 500 }}>On shore resource</span>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                    Onshore resources are excluded from the bench report
                  </div>
                </div>
              </label>
            </div>

            {error && <div style={{ marginTop: 14, color: "var(--danger, #ef4444)", fontSize: 13 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

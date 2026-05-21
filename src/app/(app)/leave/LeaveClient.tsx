"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

type Leave = {
  id: string; userId: string; type: string; startDate: string; endDate: string;
  reason: string | null; status: string;
  user: { id: string; name: string | null; email: string | null };
};

const TYPE_COLOR: Record<string, string> = { PTO: "ok", SICK: "bad", TRAINING: "warn", PUBLIC_HOLIDAY: "idle", UNPAID: "idle" };

interface Props { leaves: Leave[]; currentUserRole: Role; currentUserId: string; }

export function LeaveClient({ leaves, currentUserRole, currentUserId }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: "PTO", startDate: "", endDate: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const canApprove = currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowModal(false); window.location.reload();
    } finally { setSaving(false); }
  }

  async function handleReview(leaveId: string, action: "approve" | "reject") {
    await fetch("/api/leave", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaveId, action }) });
    window.location.reload();
  }

  const pending = leaves.filter((l) => l.status === "PENDING");
  const approved = leaves.filter((l) => l.status === "APPROVED");

  return (
    <div className="page" data-screen-label="Leave">
      <div className="page-head">
        <div>
          <h1 className="page-title">Leave</h1>
          <div className="page-sub">{pending.length} pending · {approved.length} approved</div>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowModal(true)}>+ Request leave</button>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-value">{pending.length}</div></div>
        <div className="kpi ok"><div className="kpi-label">Approved</div><div className="kpi-value">{approved.length}</div></div>
        <div className="kpi"><div className="kpi-label">Total requests</div><div className="kpi-value">{leaves.length}</div></div>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {canApprove && <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Engineer</th>}
              <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Type</th>
              <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Dates</th>
              <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Reason</th>
              <th style={{ textAlign: "left", padding: "8px", fontWeight: 500, color: "var(--text-muted)" }}>Status</th>
              {canApprove && <th style={{ padding: "8px" }} />}
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                {canApprove && <td style={{ padding: "8px" }}>{l.user.name}</td>}
                <td style={{ padding: "8px" }}>
                  <span className={`chip chip-${TYPE_COLOR[l.type]}`}>{l.type.replace("_", " ")}</span>
                </td>
                <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 12 }}>
                  {new Date(l.startDate).toLocaleDateString()} → {new Date(l.endDate).toLocaleDateString()}
                </td>
                <td style={{ padding: "8px", color: "var(--text-secondary)" }}>{l.reason ?? "—"}</td>
                <td style={{ padding: "8px" }}>
                  <span className={`chip chip-${l.status === "APPROVED" ? "ok" : l.status === "REJECTED" ? "bad" : "warn"}`}>
                    {l.status}
                  </span>
                </td>
                {canApprove && l.status === "PENDING" && (
                  <td style={{ padding: "8px" }}>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm" style={{ color: "var(--ok)" }} onClick={() => handleReview(l.id, "approve")}>Approve</button>
                      <button className="btn sm" style={{ color: "var(--bad)" }} onClick={() => handleReview(l.id, "reject")}>Reject</button>
                    </div>
                  </td>
                )}
                {canApprove && l.status !== "PENDING" && <td />}
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No leave requests found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Request Leave</h2><button className="iconbtn" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleCreate} className="modal-body">
              <label className="field"><span>Type</span>
                <select value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}>
                  <option value="PTO">PTO</option><option value="SICK">Sick</option>
                  <option value="TRAINING">Training</option><option value="UNPAID">Unpaid</option>
                </select>
              </label>
              <label className="field"><span>Start date</span><input type="date" value={form.startDate} onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))} required /></label>
              <label className="field"><span>End date</span><input type="date" value={form.endDate} onChange={(e) => setForm((s) => ({ ...s, endDate: e.target.value }))} required /></label>
              <label className="field"><span>Reason (optional)</span><input value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} /></label>
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


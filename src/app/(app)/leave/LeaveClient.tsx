"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeaveApproval = {
  id:            string;
  approverId:    string;
  approverName:  string | null;
  approverEmail: string | null;
  projectNames:  string[];          // projects this approver manages that overlap the leave
  level:         number;
  status:        string;   // PENDING | APPROVED | REJECTED
  comment:       string | null;
  createdAt:     string;
};

type Leave = {
  id:             string;
  userId:         string;
  type:           string;
  startDate:      string;
  endDate:        string;
  reason:         string | null;
  status:         string;   // PENDING | PM_APPROVED | APPROVED | REJECTED
  approvedBy:     string | null;
  clientApproval: string | null;
  backupPlan:     string | null;
  createdAt:      string;
  updatedAt:      string;
  user:           { id: string; name: string | null; email: string | null };
  approvals:      LeaveApproval[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  PTO: "ok", SICK: "bad", TRAINING: "warn", PUBLIC_HOLIDAY: "idle", UNPAID: "idle",
};

const STATUS_CHIP: Record<string, string> = {
  PENDING:     "chip chip-warn",
  PM_APPROVED: "chip chip-warn",
  APPROVED:    "chip chip-ok",
  REJECTED:    "chip chip-bad",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:     "Pending PM",
  PM_APPROVED: "Pending DO",
  APPROVED:    "Approved",
  REJECTED:    "Rejected",
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props { leaves: Leave[]; currentUserRole: Role; currentUserId: string; }

// ─── Component ─────────────────────────────────────────────────────────────────

export function LeaveClient({ leaves: initialLeaves, currentUserRole, currentUserId }: Props) {
  const [leaves,      setLeaves]      = useState<Leave[]>(initialLeaves);
  const [showModal,   setShowModal]   = useState(false);
  const [detailLeave, setDetailLeave] = useState<Leave | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [actionSaving, setActionSaving] = useState(false);

  const [form, setForm] = useState({
    type: "PTO", startDate: "", endDate: "", reason: "",
    clientApproval: "", backupPlan: "",
  });

  // Detail modal editable fields
  const [editClientApproval, setEditClientApproval] = useState("");
  const [editBackupPlan,     setEditBackupPlan]     = useState("");
  const [rejectComment,      setRejectComment]      = useState("");

  const isAdmin = currentUserRole === "ADMIN";

  // Refresh leaves from server
  async function refreshLeaves() {
    const res  = await fetch("/api/leave");
    if (res.ok) setLeaves(await res.json());
  }

  // ── Create leave ────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await fetch("/api/leave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowModal(false);
      setForm({ type: "PTO", startDate: "", endDate: "", reason: "", clientApproval: "", backupPlan: "" });
      await refreshLeaves();
    } finally { setSaving(false); }
  }

  // ── Open detail modal ───────────────────────────────────────────────────────
  function openDetail(l: Leave) {
    setDetailLeave(l);
    setEditClientApproval(l.clientApproval ?? "");
    setEditBackupPlan(l.backupPlan ?? "");
    setRejectComment("");
  }

  // ── Approve / Reject ────────────────────────────────────────────────────────
  async function handleReview(leaveId: string, action: "approve" | "reject", comment?: string) {
    setActionSaving(true);
    try {
      await fetch("/api/leave", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveId, action, comment }),
      });
      setDetailLeave(null);
      await refreshLeaves();
    } finally { setActionSaving(false); }
  }

  // ── Save text fields (client approval + backup plan) ───────────────────────
  async function handleUpdateFields(leaveId: string) {
    setActionSaving(true);
    try {
      await fetch("/api/leave", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveId, action: "update_fields",
          clientApproval: editClientApproval,
          backupPlan:     editBackupPlan,
        }),
      });
      setDetailLeave(null);
      await refreshLeaves();
    } finally { setActionSaving(false); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function myPendingApproval(l: Leave): LeaveApproval | null {
    return l.approvals.find(
      (a) => a.approverId === currentUserId && a.status === "PENDING"
    ) ?? null;
  }

  function canActOn(l: Leave) {
    return isAdmin || !!myPendingApproval(l);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const pending    = leaves.filter((l) => l.status === "PENDING" || l.status === "PM_APPROVED");
  const approved   = leaves.filter((l) => l.status === "APPROVED");
  const myPending  = leaves.filter((l) => canActOn(l) && l.status !== "APPROVED" && l.status !== "REJECTED");

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page" data-screen-label="Leave">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Leave</h1>
          <div className="page-sub">
            {pending.length} pending · {approved.length} approved
            {myPending.length > 0 && ` · ${myPending.length} awaiting your approval`}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowModal(true)}>+ Request leave</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-value">{pending.length}</div></div>
        <div className="kpi ok"><div className="kpi-label">Approved</div><div className="kpi-value">{approved.length}</div></div>
        <div className="kpi warn"><div className="kpi-label">Awaiting your action</div><div className="kpi-value">{myPending.length}</div></div>
        <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-value">{leaves.length}</div></div>
      </div>

      {/* Leave table */}
      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Employee</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Type</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Dates</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Reason</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)" }}>Approvers</th>
              <th style={{ padding: "8px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => {
              const pending = myPendingApproval(l);
              return (
                <tr
                  key={l.id}
                  onClick={() => openDetail(l)}
                  style={{ borderBottom: "1px solid var(--border-faint)", cursor: "pointer" }}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{l.user.name ?? l.user.email}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span className={`chip chip-${TYPE_COLOR[l.type]}`}>{l.type.replace("_", " ")}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12 }}>
                    {new Date(l.startDate).toLocaleDateString()} → {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.reason ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span className={STATUS_CHIP[l.status] ?? "chip"}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <ApprovalChainMini approvals={l.approvals} />
                  </td>
                  <td style={{ padding: "10px 12px" }} onClick={(e) => e.stopPropagation()}>
                    {pending && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn sm"
                          style={{ color: "var(--ok)" }}
                          onClick={() => handleReview(l.id, "approve")}
                          disabled={actionSaving}
                        >Approve</button>
                        <button
                          className="btn sm"
                          style={{ color: "var(--bad)" }}
                          onClick={() => openDetail(l)}
                        >Reject…</button>
                      </div>
                    )}
                    {isAdmin && l.status !== "APPROVED" && l.status !== "REJECTED" && !pending && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm" style={{ color: "var(--ok)" }} onClick={() => handleReview(l.id, "approve")} disabled={actionSaving}>Approve</button>
                        <button className="btn sm" style={{ color: "var(--bad)" }} onClick={() => openDetail(l)}>Reject…</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {leaves.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                  No leave requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Detail / Edit modal ─────────────────────────────────────────────── */}
      {detailLeave && (
        <div className="modal-backdrop" onClick={() => setDetailLeave(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{detailLeave.user.name ?? detailLeave.user.email} — {detailLeave.type.replace("_", " ")} Leave</h2>
              <button className="iconbtn" onClick={() => setDetailLeave(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Dates & status */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div className="field" style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Dates</span>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 13, marginTop: 4 }}>
                    {new Date(detailLeave.startDate).toLocaleDateString()} → {new Date(detailLeave.endDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Status</span>
                  <div style={{ marginTop: 4 }}>
                    <span className={STATUS_CHIP[detailLeave.status] ?? "chip"}>
                      {STATUS_LABEL[detailLeave.status] ?? detailLeave.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reason */}
              {detailLeave.reason && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Reason</div>
                  <div style={{ fontSize: 13 }}>{detailLeave.reason}</div>
                </div>
              )}

              {/* Approval chain */}
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>
                  Approval Chain
                </div>
                <ApprovalChainFull approvals={detailLeave.approvals} />
              </div>

              {/* Client approval */}
              <label className="field">
                <span>Client Approval <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(paste text received from client via email)</span></span>
                <textarea
                  rows={3}
                  value={editClientApproval}
                  onChange={(e) => setEditClientApproval(e.target.value)}
                  placeholder="Enter client approval text…"
                  style={{ resize: "vertical" }}
                />
              </label>

              {/* Backup plan */}
              <label className="field">
                <span>Backup Plan <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(who covers, how tasks are handled)</span></span>
                <textarea
                  rows={3}
                  value={editBackupPlan}
                  onChange={(e) => setEditBackupPlan(e.target.value)}
                  placeholder="Describe the backup plan…"
                  style={{ resize: "vertical" }}
                />
              </label>

              {/* Reject reason (shown only when user can act) */}
              {canActOn(detailLeave) && detailLeave.status !== "APPROVED" && detailLeave.status !== "REJECTED" && (
                <label className="field">
                  <span>Rejection reason <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional, shown to employee)</span></span>
                  <input
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="Enter reason for rejection…"
                  />
                </label>
              )}

              {/* Actions */}
              <div className="modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
                <button className="btn" onClick={() => setDetailLeave(null)}>Close</button>
                <button
                  className="btn"
                  disabled={actionSaving}
                  onClick={() => handleUpdateFields(detailLeave.id)}
                >
                  {actionSaving ? "Saving…" : "Save notes"}
                </button>
                {canActOn(detailLeave) && detailLeave.status !== "APPROVED" && detailLeave.status !== "REJECTED" && (
                  <>
                    <button
                      className="btn primary"
                      disabled={actionSaving}
                      onClick={() => handleReview(detailLeave.id, "approve")}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="btn"
                      style={{ color: "var(--bad)" }}
                      disabled={actionSaving}
                      onClick={() => handleReview(detailLeave.id, "reject", rejectComment || undefined)}
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create leave modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Request Leave</h2>
              <button className="iconbtn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <label className="field">
                <span>Type</span>
                <select value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}>
                  <option value="PTO">PTO</option>
                  <option value="SICK">Sick</option>
                  <option value="TRAINING">Training</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))} required />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm((s) => ({ ...s, endDate: e.target.value }))} required />
                </label>
              </div>
              <label className="field">
                <span>Reason <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></span>
                <input value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} placeholder="Brief reason…" />
              </label>
              <label className="field">
                <span>Client Approval <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional — paste if already received)</span></span>
                <textarea
                  rows={2} value={form.clientApproval}
                  onChange={(e) => setForm((s) => ({ ...s, clientApproval: e.target.value }))}
                  placeholder="Client approval text…" style={{ resize: "vertical" }}
                />
              </label>
              <label className="field">
                <span>Backup Plan <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></span>
                <textarea
                  rows={2} value={form.backupPlan}
                  onChange={(e) => setForm((s) => ({ ...s, backupPlan: e.target.value }))}
                  placeholder="Who covers, how tasks are handled…" style={{ resize: "vertical" }}
                />
              </label>
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

// ─── ApprovalChainMini — compact inline view for the table ─────────────────────

function ApprovalChainMini({ approvals }: { approvals: LeaveApproval[] }) {
  if (approvals.length === 0) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;

  const l1 = approvals.filter((a) => a.level === 1);
  const l2 = approvals.find((a)  => a.level === 2);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {l1.map((a) => {
        const displayName = a.approverName ?? a.approverEmail?.split("@")[0] ?? "PM";
        const projects    = a.projectNames.join(", ");
        return (
          <span
            key={a.id}
            title={`PM: ${a.approverName ?? a.approverEmail ?? "—"}${projects ? ` · ${projects}` : ""}`}
            style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 500,
              background: a.status === "APPROVED" ? "var(--ok-soft, #dcfce7)" : a.status === "REJECTED" ? "var(--bad-soft, #fee2e2)" : "var(--surface-2)",
              color:      a.status === "APPROVED" ? "var(--ok)"  : a.status === "REJECTED" ? "var(--bad)"  : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}>
            {displayName.split(" ")[0]} {a.status === "APPROVED" ? "✓" : a.status === "REJECTED" ? "✕" : "…"}
          </span>
        );
      })}
      {l2 && (
        <span title={`DO: ${l2.approverName ?? l2.approverEmail ?? "—"}`}
          style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 600,
            background: l2.status === "APPROVED" ? "var(--ok-soft, #dcfce7)" : l2.status === "REJECTED" ? "var(--bad-soft, #fee2e2)" : "var(--surface-2)",
            color:      l2.status === "APPROVED" ? "var(--ok)"  : l2.status === "REJECTED" ? "var(--bad)"  : "var(--text-muted)",
            border: "1px solid var(--accent)",
          }}>
          DO {l2.status === "APPROVED" ? "✓" : l2.status === "REJECTED" ? "✕" : "…"}
        </span>
      )}
    </div>
  );
}

// ─── ApprovalChainFull — detailed view in the modal ────────────────────────────

function ApprovalChainFull({ approvals }: { approvals: LeaveApproval[] }) {
  if (approvals.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No approvers assigned.</div>;
  }

  const l1 = approvals.filter((a) => a.level === 1);
  const l2 = approvals.find((a)  => a.level === 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Level 1 */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Level 1 — Project Managers</div>
      {l1.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>—</div>}
      {l1.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {a.approverName ?? a.approverEmail ?? "—"}
            </div>
            {a.projectNames.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {a.projectNames.join(", ")}
              </div>
            )}
          </div>
          <ApprovalBadge status={a.status} />
          {a.comment && <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.comment}>{a.comment}</span>}
        </div>
      ))}

      {/* Level 2 */}
      {l2 && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 8, marginBottom: 4 }}>Level 2 — Division Owner (Final)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--accent)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {l2.approverName ?? l2.approverEmail ?? "—"}
              </div>
            </div>
            <ApprovalBadge status={l2.status} />
            {l2.comment && <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l2.comment}>{l2.comment}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    PENDING:  { label: "Pending",  color: "var(--warn)" },
    APPROVED: { label: "Approved", color: "var(--ok)"   },
    REJECTED: { label: "Rejected", color: "var(--bad)"  },
  };
  const { label, color } = map[status] ?? { label: status, color: "var(--text-muted)" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, padding: "2px 8px", borderRadius: 10, background: "var(--bg)", border: `1px solid ${color}` }}>
      {label}
    </span>
  );
}

"use client";

import { useState } from "react";

type Timesheet = {
  id: string; userId: string; weekStart: string; totalHours: number;
  status: string; reviewNote: string | null;
  user: { id: string; name: string | null; email: string | null };
  hoursLogs: { id: string; hours: number; date: string; project: { name: string; color: string } }[];
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "idle", SUBMITTED: "warn", APPROVED: "ok", REJECTED: "bad", FLAGGED: "warn"
};

interface Props { timesheets: Timesheet[]; canReview: boolean; }

export function TimesheetsClient({ timesheets, canReview }: Props) {
  const [selected, setSelected] = useState<Timesheet | null>(timesheets[0] ?? null);
  const [filter, setFilter] = useState("ALL");
  const [reviewNote, setReviewNote] = useState("");
  const [acting, setActing] = useState(false);

  async function handleReview(action: "approve" | "reject" | "flag") {
    if (!selected) return;
    setActing(true);
    try {
      await fetch("/api/timesheets", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timesheetId: selected.id, action, reviewNote }),
      });
      window.location.reload();
    } finally { setActing(false); }
  }

  const filtered = filter === "ALL" ? timesheets : timesheets.filter((t) => t.status === filter);
  const pending = timesheets.filter((t) => t.status === "SUBMITTED" || t.status === "FLAGGED").length;

  return (
    <div className="page" data-screen-label="Timesheets">
      <div className="page-head">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <div className="page-sub">{pending} pending review</div>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        {["SUBMITTED", "FLAGGED", "APPROVED", "REJECTED"].map((s) => (
          <div key={s} className={`kpi ${STATUS_COLOR[s]}`}>
            <div className="kpi-label">{s.charAt(0) + s.slice(1).toLowerCase()}</div>
            <div className="kpi-value">{timesheets.filter((t) => t.status === s).length}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="row" style={{ gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {["ALL", "SUBMITTED", "APPROVED", "REJECTED", "FLAGGED"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13,
            fontWeight: filter === s ? 600 : 400,
            borderBottom: filter === s ? "2px solid var(--accent)" : "2px solid transparent",
            color: filter === s ? "var(--accent)" : "var(--text-secondary)"
          }}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        {/* List */}
        <div className="card" style={{ overflow: "auto", maxHeight: "60vh" }}>
          {filtered.map((t) => (
            <div key={t.id} onClick={() => setSelected(t)} style={{
              padding: "12px 14px", cursor: "pointer", borderRadius: 6,
              background: selected?.id === t.id ? "var(--accent-soft)" : "transparent",
              borderBottom: "1px solid var(--border-faint)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{t.user.name}</span>
                <span className={`chip chip-${STATUS_COLOR[t.status]}`} style={{ fontSize: 10 }}>{t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Week of {new Date(t.weekStart).toLocaleDateString()} · {t.totalHours}h
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>No timesheets found.</p>}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selected.user.name}</h2>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Week of {new Date(selected.weekStart).toLocaleDateString()} · {selected.totalHours}h total
                </div>
              </div>
              <span className={`chip chip-${STATUS_COLOR[selected.status]}`}>{selected.status}</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Project</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {selected.hoursLogs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                    <td style={{ padding: "7px 8px" }}>{new Date(l.date).toLocaleDateString()}</td>
                    <td style={{ padding: "7px 8px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.project.color }} />
                        {l.project.name}
                      </span>
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{l.hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {canReview && selected.status === "SUBMITTED" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <label className="field" style={{ marginBottom: 12 }}>
                  <span>Review note (optional)</span>
                  <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Add a note…" />
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" style={{ color: "var(--ok)" }} onClick={() => handleReview("approve")} disabled={acting}>Approve</button>
                  <button className="btn" style={{ color: "var(--warn)" }} onClick={() => handleReview("flag")} disabled={acting}>Flag</button>
                  <button className="btn" style={{ color: "var(--bad)" }} onClick={() => handleReview("reject")} disabled={acting}>Reject</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            Select a timesheet to review
          </div>
        )}
      </div>
    </div>
  );
}

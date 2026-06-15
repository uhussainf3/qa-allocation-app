"use client";

import { useState } from "react";
import {
  buildResetSummary,
  totalRecordsToDelete,
  isResetConfirmed,
  RESET_CONFIRM_PHRASE,
  RESET_PRESERVED_LABELS,
  type ResetCounts,
} from "@/lib/resetUtils";

interface DivisionDetail { id: string; name: string; code: string }
interface ProjectDetail  { id: string; name: string; code: string; status: string }
interface UserDetail     { id: string; name: string; email: string; role: string }

interface PreviewData {
  counts: ResetCounts;
  divisionDetails: DivisionDetail[];
  projectDetails: ProjectDetail[];
  userDetails: UserDetail[];
}

type Status = "idle" | "loading" | "loaded" | "confirming" | "done" | "error";

export function DangerZoneClient() {
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState<Status>("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError]     = useState("");
  const [confirmText, setConfirmText] = useState("");

  async function loadPreview() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/admin/reset");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to load preview");
        setStatus("error");
        return;
      }
      const data = await res.json();
      setPreview(data);
      setStatus("loaded");
    } catch {
      setError("Failed to load preview");
      setStatus("error");
    }
  }

  async function runReset() {
    if (!isResetConfirmed(confirmText)) return;
    if (!confirm(
      "This will permanently delete ALL divisions, projects, allocations and users " +
      "(except your own account) from the database. This cannot be undone.\n\n" +
      "Are you absolutely sure?"
    )) return;

    setStatus("confirming");
    setError("");
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Reset failed");
        setStatus("loaded");
        return;
      }
      setStatus("done");
      setPreview(null);
      setConfirmText("");
    } catch {
      setError("Reset failed");
      setStatus("loaded");
    }
  }

  const rows  = preview ? buildResetSummary(preview.counts) : [];
  const total = preview ? totalRecordsToDelete(preview.counts) : 0;
  const confirmed = isResetConfirmed(confirmText);

  return (
    <div
      className="card"
      style={{ maxWidth: 700, marginTop: 24, border: "1px solid var(--bad)" }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--bad)" }}>Danger Zone</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Permanently wipe all migration data before re-running the RM Migration import.
          </div>
        </div>
        <button className="btn sm" type="button">{open ? "Hide" : "Show"}</button>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {status === "done" ? (
            <div style={{ fontSize: 13, color: "var(--good, #16a34a)" }}>
              ✓ All data has been reset. Only your own account remains. You can now re-run the
              RM Migration import from the Import page.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                This deletes <strong>every</strong> Division, Project, Allocation, Allocation
                Batch, Leave, Hours Log, Timesheet, Task, Resource Request, Skill Assignment,
                Notification, Audit Log entry and Pipeline opportunity — and every User account
                except your own. The following are kept:
              </p>
              <ul style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, paddingLeft: 20 }}>
                {RESET_PRESERVED_LABELS.map((l) => <li key={l}>{l}</li>)}
              </ul>

              {status === "idle" || status === "error" ? (
                <button className="btn" type="button" onClick={loadPreview}>
                  Load current data summary
                </button>
              ) : status === "loading" ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading current counts…</div>
              ) : preview ? (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Table</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Records to delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                          <td style={{ padding: "6px 8px" }}>{r.label}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--mono)" }}>{r.count}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>Total</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, fontFamily: "var(--mono)" }}>{total}</td>
                      </tr>
                    </tbody>
                  </table>

                  {preview.divisionDetails.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                      Divisions: {preview.divisionDetails.map((d) => `${d.name} (${d.code})`).join(", ")}
                    </div>
                  )}
                  {preview.projectDetails.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                      Projects ({preview.projectDetails.length}{preview.projectDetails.length === 50 ? "+" : ""}):{" "}
                      {preview.projectDetails.map((p) => p.name).join(", ")}
                    </div>
                  )}
                  {preview.userDetails.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                      Users to be removed ({preview.userDetails.length}{preview.userDetails.length === 50 ? "+" : ""}):{" "}
                      {preview.userDetails.map((u) => `${u.name} (${u.email})`).join(", ")}
                    </div>
                  )}

                  <label className="field" style={{ maxWidth: 360 }}>
                    <span>
                      Type <code>{RESET_CONFIRM_PHRASE}</code> to enable the delete button
                    </span>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={RESET_CONFIRM_PHRASE}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      className="btn"
                      type="button"
                      style={{ background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" }}
                      disabled={!confirmed || status === "confirming"}
                      onClick={runReset}
                    >
                      {status === "confirming" ? "Deleting…" : "Permanently delete everything"}
                    </button>
                    <button className="btn sm" type="button" onClick={loadPreview}>
                      Refresh counts
                    </button>
                  </div>
                </>
              ) : null}

              {error && (
                <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 12 }}>{error}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

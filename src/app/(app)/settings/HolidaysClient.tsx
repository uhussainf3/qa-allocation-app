"use client";

import { useState } from "react";
import type { Role } from "@/types/enums";

type Holiday = { id: string; date: string; name: string };

interface Props {
  initialHolidays: Holiday[];
  currentUserRole:  Role;
}

export function HolidaysClient({ initialHolidays, currentUserRole }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [date,     setDate]     = useState("");
  const [name,     setName]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const isAdmin = currentUserRole === "ADMIN";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/holidays", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ date, name: name.trim() }),
      });
      if (res.ok) {
        const { holiday } = await res.json();
        setHolidays((prev) =>
          [...prev, holiday].sort((a, b) => a.date.localeCompare(b.date))
        );
        setDate("");
        setName("");
      } else {
        const d = await res.json();
        setError(d.error ?? "Failed to add holiday");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this public holiday?")) return;
    const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    if (res.ok) setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  function fmtDate(iso: string) {
    // iso is YYYY-MM-DD; add T00:00:00 so it parses in local tz
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  return (
    <div className="page" data-screen-label="Settings">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Public holidays — excluded from working-day calculations</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Public Holidays</div>

        {isAdmin && (
          <form
            onSubmit={handleAdd}
            style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}
          >
            <label className="field" style={{ flex: "0 0 160px", marginBottom: 0 }}>
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>Name</span>
              <input
                placeholder="e.g. Eid ul-Fitr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn primary"
              disabled={saving}
              style={{ flexShrink: 0 }}
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        {error && (
          <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {holidays.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            No public holidays configured yet.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left",  padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Date</th>
                <th style={{ textAlign: "left",  padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>Name</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "8px 8px", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                    {fmtDate(h.date)}
                  </td>
                  <td style={{ padding: "8px 8px" }}>{h.name}</td>
                  {isAdmin && (
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>
                      <button
                        className="btn sm"
                        style={{ color: "var(--bad)" }}
                        onClick={() => handleDelete(h.id)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

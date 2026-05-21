"use client";

import { useState } from "react";

type ImportRow = { userName: string; userEmail: string; projectCode: string; weekStart: string; hours: number; notes?: string };
type ImportResult = { created: number; errors: { row: number; message: string }[] };

const STEPS = ["Upload file", "Map columns", "Confirm", "Done"];
const SAMPLE_CSV = `userName,userEmail,projectCode,weekStart,hours,notes
John Doe,john@company.com,PROJ-001,2025-05-12,32,Backend work
Jane Smith,jane@company.com,PROJ-002,2025-05-12,24,Testing`;

export function ImportClient() {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileError, setFileError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map((h) => h.trim());
        const required = ["userEmail", "projectCode", "weekStart", "hours"];
        const missing = required.filter((r) => !headers.includes(r));
        if (missing.length > 0) { setFileError(`Missing columns: ${missing.join(", ")}`); return; }

        const parsed = lines.slice(1).map((line) => {
          const vals = line.split(",");
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ""; });
          return { userName: obj.userName ?? "", userEmail: obj.userEmail, projectCode: obj.projectCode, weekStart: obj.weekStart, hours: Number(obj.hours), notes: obj.notes };
        });
        setRows(parsed);
        setStep(1);
      } catch { setFileError("Failed to parse file. Please use the CSV format shown below."); }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allocations", rows }),
      });
      const data = await res.json();
      setResult(data);
      setStep(3);
    } finally { setImporting(false); }
  }

  return (
    <div className="page" data-screen-label="Import">
      <div className="page-head">
        <h1 className="page-title">Import data</h1>
        <div className="page-sub">Bulk import allocations from CSV</div>
      </div>

      {/* Stepper */}
      <div className="row" style={{ gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s} className="row" style={{ gap: 0 }}>
            <div style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: i === step ? "var(--accent)" : i < step ? "var(--ok)" : "var(--surface-2)",
              color: i <= step ? "white" : "var(--text-muted)"
            }}>{i + 1}. {s}</div>
            {i < STEPS.length - 1 && <div style={{ width: 32, height: 2, background: "var(--border)", margin: "0 4px", alignSelf: "center" }} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card" style={{ maxWidth: 540 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Upload a CSV file</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Your CSV must include: <code>userEmail</code>, <code>projectCode</code>, <code>weekStart</code> (YYYY-MM-DD), <code>hours</code>
          </p>
          <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ marginBottom: 12 }} />
          {fileError && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 12 }}>{fileError}</div>}
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>View sample CSV format</summary>
            <pre style={{ fontSize: 11, background: "var(--surface-2)", padding: 12, borderRadius: 6, marginTop: 8, overflowX: "auto" }}>{SAMPLE_CSV}</pre>
          </details>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Preview — {rows.length} rows</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Email", "Project code", "Week start", "Hours", "Notes"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "6px 8px" }}>{r.userEmail}</td>
                  <td style={{ padding: "6px 8px" }}>{r.projectCode}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{r.weekStart}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{r.hours}h</td>
                  <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>…and {rows.length - 10} more rows</p>}
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary" onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Confirm import</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            You are about to import <strong>{rows.length} allocation rows</strong>. Existing allocations for the same engineer/project/week will be updated.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={handleImport} disabled={importing}>{importing ? "Importing…" : "Import now"}</button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{result.errors.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
            {result.created} allocations imported
          </div>
          {result.errors.length > 0 && (
            <>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--bad)", marginBottom: 8 }}>{result.errors.length} errors:</div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Row {e.row}: {e.message}</div>
              ))}
            </>
          )}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => { setStep(0); setRows([]); setResult(null); }}>Import more</button>
        </div>
      )}
    </div>
  );
}

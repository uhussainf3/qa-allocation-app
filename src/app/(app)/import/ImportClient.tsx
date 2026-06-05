"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

// ─── Legacy allocation import ────────────────────────────────────────────────

type LegacyRow    = { userName: string; userEmail: string; projectCode: string; weekStart: string; hours: number; notes?: string };
type LegacyResult = { created: number; errors: { row: number; message: string }[] };

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += line[i]; }
  }
  result.push(cur.trim());
  return result;
}

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

function LegacyImport() {
  const [step, setStep]       = useState(0);
  const [rows, setRows]       = useState<LegacyRow[]>([]);
  const [result, setResult]   = useState<LegacyResult | null>(null);
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
        const { headers, rows: csvRows } = parseCsvText(text);
        const required = ["userEmail", "projectCode", "weekStart", "hours"];
        const missing  = required.filter((r) => !headers.includes(r));
        if (missing.length > 0) { setFileError(`Missing columns: ${missing.join(", ")}`); return; }
        const parsed = csvRows.map((r) => ({
          userName: r.userName ?? "", userEmail: r.userEmail,
          projectCode: r.projectCode, weekStart: r.weekStart,
          hours: Number(r.hours), notes: r.notes,
        }));
        setRows(parsed);
        setStep(1);
      } catch { setFileError("Failed to parse CSV."); }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res  = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "allocations", rows }) });
      const data = await res.json();
      setResult(data);
      setStep(3);
    } finally { setImporting(false); }
  }

  const STEPS = ["Upload file", "Preview", "Confirm", "Done"];

  return (
    <>
      <div className="row" style={{ gap: 0, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s} className="row" style={{ gap: 0 }}>
            <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: i === step ? "var(--accent)" : i < step ? "var(--ok)" : "var(--surface-2)", color: i <= step ? "white" : "var(--text-muted)" }}>{i + 1}. {s}</div>
            {i < STEPS.length - 1 && <div style={{ width: 28, height: 2, background: "var(--border)", margin: "0 4px", alignSelf: "center" }} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Upload CSV</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>Required columns: <code>userEmail</code>, <code>projectCode</code>, <code>weekStart</code> (YYYY-MM-DD), <code>hours</code></p>
          <input type="file" accept=".csv,.txt" onChange={handleFile} />
          {fileError && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 10 }}>{fileError}</div>}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Preview — {rows.length} rows</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["#","Email","Project","Week","Hours","Notes"].map((h) => <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px" }}>{r.userEmail}</td>
                  <td style={{ padding: "5px 8px" }}>{r.projectCode}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.weekStart}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.hours}h</td>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>…and {rows.length - 10} more</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary" onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ maxWidth: 460 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Confirm import</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>Import <strong>{rows.length} allocation rows</strong>. Duplicates will be updated.</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={handleImport} disabled={importing}>{importing ? "Importing…" : "Import now"}</button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="card" style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{result.errors.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{result.created} allocations imported</div>
          {result.errors.length > 0 && (
            <>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--bad)", marginBottom: 6 }}>{result.errors.length} errors</div>
              {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Row {e.row}: {e.message}</div>)}
            </>
          )}
          <button className="btn" style={{ marginTop: 14 }} onClick={() => { setStep(0); setRows([]); setResult(null); }}>Import more</button>
        </div>
      )}
    </>
  );
}

// ─── RM Tool import ──────────────────────────────────────────────────────────

type RMPhase   = "idle" | "files" | "preview" | "running" | "done";
type PhaseResult = { label: string; created: number; skipped: number; errors: { row?: number; directorId?: string; projectId?: string; fomsId?: string; message: string }[] };

function RMImport() {
  const [phase, setPhase]               = useState<RMPhase>("idle");
  const [employeeFile, setEmployeeFile] = useState<File | null>(null);
  const [projectsFile, setProjectsFile] = useState<File | null>(null);
  const [rmDataFile,   setRMDataFile]   = useState<File | null>(null);
  const [batchLabel,   setBatchLabel]   = useState(`RM Import — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  const [parseError,   setParseError]   = useState("");
  const [preview, setPreview]           = useState<{ divisions: number; projects: number; employees: number; allocations: number } | null>(null);
  const [log, setLog]                   = useState<PhaseResult[]>([]);
  const [running, setRunning]           = useState(false);

  // Parsed data
  type EmpRow  = { fomsId: string; name: string; email: string; rmRole: string };
  type ProjRow = { projectId: string; name: string; status: string; directorId: string; startDate: string; endDate: string };
  type AllocRow = { employeeId: string; projectId: string; allocation: number; startDate: string; endDate: string };

  const [empRows,   setEmpRows]   = useState<EmpRow[]>([]);
  const [projRows,  setProjRows]  = useState<ProjRow[]>([]);
  const [allocRows, setAllocRows] = useState<AllocRow[]>([]);
  const [divRows,   setDivRows]   = useState<{ directorId: string; directorName: string; email: string }[]>([]);

  function readFile(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = (e) => res(e.target?.result as string);
      reader.onerror = rej;
      reader.readAsText(file);
    });
  }

  async function handleParse() {
    if (!employeeFile || !projectsFile || !rmDataFile) {
      setParseError("Please select all three CSV files.");
      return;
    }
    setParseError("");

    try {
      const [empText, projText, rmText] = await Promise.all([
        readFile(employeeFile),
        readFile(projectsFile),
        readFile(rmDataFile),
      ]);

      const { rows: empCsvRows  } = parseCsvText(empText);
      const { rows: projCsvRows } = parseCsvText(projText);
      const { rows: rmCsvRows   } = parseCsvText(rmText);

      // Build FomsId → email map from Employee_RM.csv
      const fomsToEmail: Record<string, string> = {};
      const empParsed: EmpRow[] = [];
      for (const r of empCsvRows) {
        const fomsId = r["FomsId"]?.trim();
        const email  = r["Email"]?.trim();
        if (fomsId) fomsToEmail[fomsId] = email;
        if (fomsId && email) {
          empParsed.push({
            fomsId,
            name:   r["Employee"]?.trim() ?? "",
            email,
            rmRole: r["Role"]?.trim() ?? "",
          });
        }
      }

      // Extract unique directors from Projects File.csv
      const directorMap: Record<string, { directorId: string; directorName: string; email: string }> = {};
      const projParsed: ProjRow[] = [];
      for (const r of projCsvRows) {
        const dirId   = r["DirectorID"]?.trim();
        const dirName = (r["Director"] ?? r["Director Name"] ?? "").trim();
        if (dirId && !directorMap[dirId]) {
          directorMap[dirId] = { directorId: dirId, directorName: dirName, email: fomsToEmail[dirId] ?? "" };
        }
        const projId = r["ProjectID"]?.trim();
        if (projId) {
          projParsed.push({
            projectId:  projId,
            name:       r["Project"]?.trim() ?? "",
            status:     r["Status"]?.trim() ?? "Active",
            directorId: dirId ?? "",
            startDate:  r["Start Date"]?.trim() ?? "",
            endDate:    r["End Date"]?.trim() ?? "",
          });
        }
      }
      const divParsed = Object.values(directorMap);

      // Compute dominant director per employee from RM - Data.csv
      const directorSet = new Set(divParsed.map((d) => d.directorId));
      const empDirCount: Record<string, Record<string, number>> = {};
      const allocParsed: AllocRow[] = [];
      for (const r of rmCsvRows) {
        const empId  = r["Employee ID"]?.trim();
        const projId = r["Project ID"]?.trim();
        const alloc  = parseFloat(r["Allocation %"] ?? "0");
        const start  = r["start Dte"]?.trim() ?? "";
        const end    = r["End Date"]?.trim() ?? "";
        const dirId  = r["Director ID"]?.trim();
        if (empId && projId && start && end) {
          allocParsed.push({ employeeId: empId, projectId: projId, allocation: alloc, startDate: start, endDate: end });
        }
        if (empId && dirId) {
          if (!empDirCount[empId]) empDirCount[empId] = {};
          empDirCount[empId][dirId] = (empDirCount[empId][dirId] ?? 0) + 1;
        }
      }

      // Attach dominantDirectorId to each employee
      const empWithDir = empParsed.map((e) => {
        if (directorSet.has(e.fomsId)) return null; // skip directors
        const counts = empDirCount[e.fomsId];
        let dom: string | undefined;
        if (counts) {
          dom = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        }
        return { ...e, dominantDirectorId: dom };
      }).filter(Boolean) as (EmpRow & { dominantDirectorId?: string })[];

      setDivRows(divParsed);
      setProjRows(projParsed);
      setEmpRows(empWithDir);
      setAllocRows(allocParsed);
      setPreview({ divisions: divParsed.length, projects: projParsed.length, employees: empWithDir.length, allocations: allocParsed.length });
      setPhase("preview");
    } catch (e) {
      setParseError(`Parse failed: ${String(e)}`);
    }
  }

  async function runImports() {
    setRunning(true);
    setPhase("running");
    const results: PhaseResult[] = [];

    async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.json();
    }

    // Step 2: Divisions
    try {
      const d = await post("/api/import/divisions", { rows: divRows }) as { created?: number; skipped?: number; errors?: unknown[] };
      results.push({ label: "Divisions", created: d.created ?? 0, skipped: d.skipped ?? 0, errors: (d.errors as PhaseResult["errors"]) ?? [] });
    } catch (e) { results.push({ label: "Divisions", created: 0, skipped: 0, errors: [{ message: String(e) }] }); }
    setLog([...results]);

    // Step 3: Projects
    try {
      const d = await post("/api/import/projects", { rows: projRows }) as { created?: number; updated?: number; errors?: unknown[] };
      results.push({ label: "Projects", created: (d.created ?? 0) + (d.updated ?? 0), skipped: 0, errors: (d.errors as PhaseResult["errors"]) ?? [] });
    } catch (e) { results.push({ label: "Projects", created: 0, skipped: 0, errors: [{ message: String(e) }] }); }
    setLog([...results]);

    // Step 4: Employees
    try {
      const d = await post("/api/import/employees", { rows: empRows }) as { created?: number; skipped?: number; errors?: unknown[] };
      results.push({ label: "Employees", created: d.created ?? 0, skipped: d.skipped ?? 0, errors: (d.errors as PhaseResult["errors"]) ?? [] });
    } catch (e) { results.push({ label: "Employees", created: 0, skipped: 0, errors: [{ message: String(e) }] }); }
    setLog([...results]);

    // Step 5: Allocations
    try {
      const d = await post("/api/import/allocations", { label: batchLabel, sourceFile: rmDataFile!.name, rows: allocRows }) as { created?: number; skipped?: number; errors?: unknown[]; batchId?: string };
      results.push({ label: "Allocations", created: d.created ?? 0, skipped: d.skipped ?? 0, errors: (d.errors as PhaseResult["errors"]) ?? [] });
    } catch (e) { results.push({ label: "Allocations", created: 0, skipped: 0, errors: [{ message: String(e) }] }); }
    setLog([...results]);

    setRunning(false);
    setPhase("done");
  }

  const totalErrors = log.reduce((s, r) => s + r.errors.length, 0);

  if (phase === "idle") return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>RM Tool Migration</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Import divisions, projects, employees, and allocations from RM tool CSVs in one pass.
        Run this once to seed the database from the RM export.
      </p>
      <button className="btn primary" onClick={() => setPhase("files")}>Start migration</button>
    </div>
  );

  if (phase === "files") return (
    <div className="card" style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>Upload RM Tool CSVs</div>

      {[
        { label: "Employee_RM.csv", desc: "All employees + directors", set: setEmployeeFile, val: employeeFile },
        { label: "Projects File.csv", desc: "All projects with director assignments", set: setProjectsFile, val: projectsFile },
        { label: "RM - Data.csv", desc: "All allocation rows", set: setRMDataFile, val: rmDataFile },
      ].map(({ label, desc, set, val }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{desc}</div>
          <input type="file" accept=".csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) set(f); }} />
          {val && <span style={{ fontSize: 12, color: "var(--ok)", marginLeft: 8 }}>✓ {val.name}</span>}
        </div>
      ))}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Batch label</div>
        <input className="input" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} style={{ width: "100%" }} />
      </div>

      {parseError && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 10 }}>{parseError}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => setPhase("idle")}>Cancel</button>
        <button className="btn primary" onClick={handleParse} disabled={!employeeFile || !projectsFile || !rmDataFile}>Parse files</button>
      </div>
    </div>
  );

  if (phase === "preview" && preview) return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, marginBottom: 14 }}>Ready to import</div>
      {[
        { label: "Divisions (director users + divisions)", count: preview.divisions },
        { label: "Projects", count: preview.projects },
        { label: "Employees", count: preview.employees },
        { label: "Allocation rows", count: preview.allocations },
      ].map(({ label, count }) => (
        <div key={label} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-faint)" }}>
          <span style={{ fontSize: 13 }}>{label}</span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{count.toLocaleString()}</span>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 16 }}>
        Existing records matched by external ID will be updated. Previous allocation batches will be marked inactive.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => setPhase("files")}>Back</button>
        <button className="btn primary" onClick={runImports}>Run import</button>
      </div>
    </div>
  );

  if (phase === "running" || phase === "done") {
    const stages = ["Divisions", "Projects", "Employees", "Allocations"];
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>{phase === "running" ? "Importing…" : "Import complete"}</div>
        {stages.map((s, i) => {
          const result = log[i];
          const isActive = phase === "running" && log.length === i;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-faint)" }}>
              <div style={{ width: 18, textAlign: "center", fontSize: 14 }}>
                {result ? (result.errors.length > 0 ? "⚠" : "✓") : isActive ? "⟳" : "·"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{s}</div>
                {result && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {result.created} imported{result.skipped > 0 ? `, ${result.skipped} skipped` : ""}
                    {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {phase === "done" && (
          <>
            {totalErrors > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ fontSize: 13, cursor: "pointer", color: "var(--bad)" }}>{totalErrors} total errors — click to expand</summary>
                <div style={{ marginTop: 8 }}>
                  {log.flatMap((r) => r.errors.map((e, i) => (
                    <div key={`${r.label}-${i}`} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <strong>{r.label}</strong>: {e.message}
                    </div>
                  )))}
                </div>
              </details>
            )}
            <button className="btn" style={{ marginTop: 16 }} onClick={() => { setPhase("idle"); setLog([]); setPreview(null); setEmployeeFile(null); setProjectsFile(null); setRMDataFile(null); }}>
              Done
            </button>
          </>
        )}
      </div>
    );
  }

  return null;
}

// ─── Top-level component ─────────────────────────────────────────────────────

export function ImportClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [tab, setTab] = useState<"rm" | "legacy">(isAdmin ? "rm" : "legacy");

  return (
    <div className="page" data-screen-label="Import">
      <div className="page-head">
        <h1 className="page-title">Import data</h1>
        <div className="page-sub">Bulk import from RM tool or CSV</div>
      </div>

      {isAdmin && (
        <div className="row" style={{ gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          {([["rm", "RM Tool Migration"], ["legacy", "CSV Allocation Import"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
                fontWeight: tab === t ? 600 : 400, fontSize: 14,
                color: tab === t ? "var(--accent)" : "var(--text-muted)",
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "rm"     && <RMImport />}
      {tab === "legacy" && <LegacyImport />}
    </div>
  );
}

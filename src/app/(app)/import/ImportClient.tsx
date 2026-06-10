"use client";

import { useState, useRef, useEffect } from "react";
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
  const legacyFileRef = useRef<HTMLInputElement>(null);
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
          <input
            ref={legacyFileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 4 }}>
            <button type="button" className="btn" onClick={() => legacyFileRef.current?.click()}>Choose file</button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>CSV only</span>
          </div>
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
  const empRef  = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const rmRef   = useRef<HTMLInputElement>(null);

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
  type EmpRow  = { fomsId: string; name: string; email: string; rmRole: string; position: string };
  type ProjRow = { projectId: string; name: string; status: string; directorId: string; pmName: string; startDate: string; endDate: string };
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
            name:     r["Employee"]?.trim() ?? "",
            email,
            rmRole:   r["Role"]?.trim() ?? "",
            position: r["Position"]?.trim() ?? "",
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
            pmName:     r["PM"]?.trim() ?? "",
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

      {([
        { label: "Employee_RM.csv",  desc: "All employees + directors",              ref: empRef,  set: setEmployeeFile, val: employeeFile },
        { label: "Projects File.csv", desc: "All projects with director assignments", ref: projRef, set: setProjectsFile, val: projectsFile },
        { label: "RM - Data.csv",    desc: "All allocation rows",                    ref: rmRef,   set: setRMDataFile,   val: rmDataFile   },
      ] as const).map(({ label, desc, ref, set, val }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{desc}</div>
          <input
            ref={ref}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) set(f); }}
          />
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button type="button" className="btn" onClick={() => ref.current?.click()}>
              Choose file
            </button>
            <span style={{ fontSize: 13, color: val ? "var(--ok)" : "var(--text-muted)" }}>
              {val ? `✓ ${val.name}` : "No file chosen"}
            </span>
          </div>
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

// ─── Standalone Projects import ──────────────────────────────────────────────

type ProjectsImportPhase = "idle" | "preview" | "confirming" | "done";

type ProjImportRow = {
  projectId: string;
  name: string;
  status: string;
  directorId: string;
  pmName?: string;
  startDate?: string;
  endDate?: string;
};

function ProjectsImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [phase,      setPhase]      = useState<ProjectsImportPhase>("idle");
  const [parseError, setParseError] = useState("");
  const [rows,       setRows]       = useState<ProjImportRow[]>([]);
  const [result,     setResult]     = useState<{ created: number; updated: number; errors: { projectId: string; message: string }[] } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParseError("");
    setRows([]);
    setPhase("idle");
  }

  function handleParse() {
    if (!file) { setParseError("Please select a Projects CSV file."); return; }
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { rows: csvRows } = parseCsvText(ev.target?.result as string);
        const required = ["ProjectID", "Project", "Status", "DirectorID"];
        const sampleHeaders = csvRows.length > 0 ? Object.keys(csvRows[0]) : [];
        const missing = required.filter((h) => !sampleHeaders.includes(h));
        if (missing.length > 0) { setParseError(`Missing columns: ${missing.join(", ")}`); return; }
        const parsed: ProjImportRow[] = csvRows
          .filter((r) => r["ProjectID"]?.trim())
          .map((r) => ({
            projectId:  r["ProjectID"].trim(),
            name:       r["Project"]?.trim() ?? "",
            status:     r["Status"]?.trim() ?? "Active",
            directorId: r["DirectorID"]?.trim() ?? "",
            pmName:     r["PM"]?.trim() || undefined,
            startDate:  r["Start Date"]?.trim() || undefined,
            endDate:    r["End Date"]?.trim() || undefined,
          }));
        if (parsed.length === 0) { setParseError("No valid rows found."); return; }
        setRows(parsed);
        setPhase("preview");
      } catch { setParseError("Failed to parse CSV."); }
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    setPhase("confirming");
    try {
      const res  = await fetch("/api/import/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const data = await res.json() as { created?: number; updated?: number; errors?: { projectId: string; message: string }[] };
      setResult({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? [] });
      setPhase("done");
    } catch (e) {
      setParseError(`Import failed: ${String(e)}`);
      setPhase("preview");
    }
  }

  function reset() { setPhase("idle"); setFile(null); setRows([]); setResult(null); setParseError(""); }

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Import projects from CSV</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Upload your <code>Projects File.csv</code>. Required columns: <code>ProjectID</code>, <code>Project</code>, <code>Status</code>, <code>DirectorID</code>.
        Optional: <code>Start Date</code>, <code>End Date</code> (YYYY.MM.DD).
      </p>

      {phase !== "done" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Projects CSV</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFile} />
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Choose file</button>
            <span style={{ fontSize: 13, color: file ? "var(--ok)" : "var(--text-muted)" }}>{file ? `✓ ${file.name}` : "No file chosen"}</span>
          </div>
        </div>
      )}

      {parseError && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 10 }}>{parseError}</div>}

      {phase === "idle" && (
        <button className="btn primary" onClick={handleParse} disabled={!file}>Parse file</button>
      )}

      {phase === "preview" && (
        <>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>{rows.length} projects found</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["#", "ID", "Name", "Status", "Director ID", "Start", "End"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.projectId}</td>
                  <td style={{ padding: "5px 8px" }}>{r.name}</td>
                  <td style={{ padding: "5px 8px" }}>{r.status}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.directorId}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.startDate ?? "—"}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.endDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>…and {rows.length - 10} more</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setPhase("idle")}>Back</button>
            <button className="btn primary" onClick={handleConfirm}>Import {rows.length} projects</button>
          </div>
        </>
      )}

      {phase === "confirming" && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Importing…</div>}

      {phase === "done" && result && (
        <>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{result.errors.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.created} created, {result.updated} updated</div>
          {result.errors.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 13, cursor: "pointer", color: "var(--bad)" }}>{result.errors.length} errors</summary>
              <div style={{ marginTop: 6 }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{e.projectId}: {e.message}</div>
                ))}
              </div>
            </details>
          )}
          <button className="btn" style={{ marginTop: 8 }} onClick={reset}>Import more</button>
        </>
      )}
    </div>
  );
}

// ─── Standalone Employees import ──────────────────────────────────────────────

type EmpImportPhase = "idle" | "preview" | "confirming" | "done";

type EmpImportRow = {
  fomsId: string;
  name: string;
  email: string;
  rmRole: string;
  position: string;
};

function EmployeesImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [phase,      setPhase]      = useState<EmpImportPhase>("idle");
  const [parseError, setParseError] = useState("");
  const [rows,       setRows]       = useState<EmpImportRow[]>([]);
  const [result,     setResult]     = useState<{ created: number; skipped: number; errors: { fomsId: string; message: string }[] } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParseError("");
    setRows([]);
    setPhase("idle");
  }

  function handleParse() {
    if (!file) { setParseError("Please select an Employee CSV file."); return; }
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { rows: csvRows } = parseCsvText(ev.target?.result as string);
        const required = ["FomsId", "Employee", "Email"];
        const sampleHeaders = csvRows.length > 0 ? Object.keys(csvRows[0]) : [];
        const missing = required.filter((h) => !sampleHeaders.includes(h));
        if (missing.length > 0) { setParseError(`Missing columns: ${missing.join(", ")}`); return; }
        const parsed: EmpImportRow[] = csvRows
          .filter((r) => r["FomsId"]?.trim() && r["Email"]?.trim())
          .map((r) => ({
            fomsId:   r["FomsId"].trim(),
            name:     r["Employee"]?.trim() ?? "",
            email:    r["Email"].trim(),
            rmRole:   r["Role"]?.trim() ?? "",
            position: r["Position"]?.trim() ?? "",
          }));
        if (parsed.length === 0) { setParseError("No valid rows found (FomsId and Email are required)."); return; }
        setRows(parsed);
        setPhase("preview");
      } catch { setParseError("Failed to parse CSV."); }
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    setPhase("confirming");
    try {
      const res  = await fetch("/api/import/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const data = await res.json() as { created?: number; skipped?: number; errors?: { fomsId: string; message: string }[] };
      setResult({ created: data.created ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? [] });
      setPhase("done");
    } catch (e) {
      setParseError(`Import failed: ${String(e)}`);
      setPhase("preview");
    }
  }

  function reset() { setPhase("idle"); setFile(null); setRows([]); setResult(null); setParseError(""); }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Import employees from CSV</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Upload your <code>Employee_RM.csv</code>. Required columns: <code>FomsId</code>, <code>Employee</code>, <code>Email</code>.
        Optional: <code>Role</code> (sets department), <code>Position</code> (sets job title).
        Division assignment is skipped — use Full RM Migration to assign divisions via director data.
      </p>

      {phase !== "done" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Employee CSV</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFile} />
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Choose file</button>
            <span style={{ fontSize: 13, color: file ? "var(--ok)" : "var(--text-muted)" }}>{file ? `✓ ${file.name}` : "No file chosen"}</span>
          </div>
        </div>
      )}

      {parseError && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 10 }}>{parseError}</div>}

      {phase === "idle" && (
        <button className="btn primary" onClick={handleParse} disabled={!file}>Parse file</button>
      )}

      {phase === "preview" && (
        <>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>{rows.length} employees found</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["#", "FomsId", "Name", "Email", "Role", "Position"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.fomsId}</td>
                  <td style={{ padding: "5px 8px" }}>{r.name}</td>
                  <td style={{ padding: "5px 8px" }}>{r.email}</td>
                  <td style={{ padding: "5px 8px" }}>{r.rmRole}</td>
                  <td style={{ padding: "5px 8px" }}>{r.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>…and {rows.length - 10} more</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setPhase("idle")}>Back</button>
            <button className="btn primary" onClick={handleConfirm}>Import {rows.length} employees</button>
          </div>
        </>
      )}

      {phase === "confirming" && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Importing…</div>}

      {phase === "done" && result && (
        <>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{result.errors.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.created} created, {result.skipped} updated/skipped</div>
          {result.errors.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 13, cursor: "pointer", color: "var(--bad)" }}>{result.errors.length} errors</summary>
              <div style={{ marginTop: 6 }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{e.fomsId}: {e.message}</div>
                ))}
              </div>
            </details>
          )}
          <button className="btn" style={{ marginTop: 8 }} onClick={reset}>Import more</button>
        </>
      )}
    </div>
  );
}

// ─── Weekly batch upload ─────────────────────────────────────────────────────

type WeeklyRow = {
  employeeId:  string;
  empName:     string;
  projectId:   string;
  projectName: string;
  directorId:  string;
  allocation:  number;
  startDate:   string;
  endDate:     string;
};

type AutoCreated = { externalId: string; name: string };

type PreviewData = {
  total:                number;
  wouldCreate:          number;
  wouldUpdate:          number;
  employeesWouldCreate: AutoCreated[];
  projectsWouldCreate:  AutoCreated[];
  errors:               { row: number; message: string }[];
};

type ImportResult = {
  created:             number;
  updated:             number;
  employeesAutoCreated: AutoCreated[];
  projectsAutoCreated:  AutoCreated[];
  errors:              { row: number; message: string }[];
};

function WeeklyUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [batchLabel,  setBatchLabel]  = useState(`RM Week — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  const [phase,       setPhase]       = useState<"idle" | "previewing" | "preview" | "confirming" | "done">("idle");
  const [fileError,   setFileError]   = useState("");
  const [parseError,  setParseError]  = useState("");
  const [preview,     setPreview]     = useState<PreviewData | null>(null);
  const [result,      setResult]      = useState<ImportResult | null>(null);
  const [rows,        setRows]        = useState<WeeklyRow[]>([]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setFileError("Only .csv files are accepted.");
      e.target.value = "";
      return;
    }
    setFileError("");
    setFile(f);
    setParseError("");
    setPreview(null);
    setPhase("idle");
  }

  function clearFile() {
    setFile(null);
    setFileError("");
    setParseError("");
    setPreview(null);
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handlePreview() {
    if (!file) { setParseError("Please select RM - Data.csv"); return; }
    setParseError("");
    setPhase("previewing");

    let text: string;
    try {
      text = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload  = (e) => res(e.target?.result as string);
        r.onerror = rej;
        r.readAsText(file);
      });
    } catch {
      setParseError("Failed to read file.");
      setPhase("idle");
      return;
    }

    const { rows: csvRows } = parseCsvText(text);
    const parsed: WeeklyRow[] = csvRows
      .filter((r) => r["Employee ID"]?.trim() && r["Project ID"]?.trim())
      .map((r) => ({
        employeeId:  r["Employee ID"].trim(),
        empName:     r["Emp Name"]?.trim() ?? "",
        projectId:   r["Project ID"].trim(),
        projectName: r["Project Name"]?.trim() ?? "",
        directorId:  r["Director ID"]?.trim() ?? "",
        allocation:  parseFloat(r["Allocation %"] ?? "0"),
        startDate:   r["start Dte"]?.trim() ?? "",
        endDate:     r["End Date"]?.trim() ?? "",
      }));
    setRows(parsed);

    // Dry-run to get create/update/auto-create/error counts
    try {
      const res  = await fetch("/api/import/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: batchLabel, sourceFile: file.name, dryRun: true, rows: parsed }),
      });
      const text = await res.text();
      let data: { wouldCreate?: number; wouldUpdate?: number; employeesWouldCreate?: AutoCreated[]; projectsWouldCreate?: AutoCreated[]; errors?: { row: number; message: string }[]; error?: string } = {};
      try { data = JSON.parse(text); } catch {
        setParseError(`Preview failed: server error (${res.status}). Check the server logs.`);
        setPhase("idle");
        return;
      }
      if (!res.ok) {
        setParseError(data.error ?? "Preview failed — check your permissions.");
        setPhase("idle");
        return;
      }
      setPreview({
        total:                parsed.length,
        wouldCreate:          data.wouldCreate          ?? 0,
        wouldUpdate:          data.wouldUpdate          ?? 0,
        employeesWouldCreate: data.employeesWouldCreate ?? [],
        projectsWouldCreate:  data.projectsWouldCreate  ?? [],
        errors:               data.errors               ?? [],
      });
      setPhase("preview");
    } catch (e) {
      setParseError(`Preview failed: ${String(e)}`);
      setPhase("idle");
    }
  }

  async function handleConfirm() {
    if (!file || rows.length === 0) return;
    setPhase("confirming");
    try {
      const res  = await fetch("/api/import/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: batchLabel, sourceFile: file.name, rows }),
      });
      const text = await res.text();
      let data: { created?: number; updated?: number; employeesAutoCreated?: AutoCreated[]; projectsAutoCreated?: AutoCreated[]; errors?: { row: number; message: string }[]; error?: string } = {};
      try { data = JSON.parse(text); } catch {
        setParseError(`Import failed: server error (${res.status}). Check the server logs.`);
        setPhase("preview");
        return;
      }
      if (!res.ok) {
        setParseError(data.error ?? `Import failed with status ${res.status}.`);
        setPhase("preview");
        return;
      }
      setResult({
        created:              data.created              ?? 0,
        updated:              data.updated              ?? 0,
        employeesAutoCreated: data.employeesAutoCreated ?? [],
        projectsAutoCreated:  data.projectsAutoCreated  ?? [],
        errors:               data.errors               ?? [],
      });
      setPhase("done");
    } catch (e) {
      setParseError(`Import failed: ${String(e)}`);
      setPhase("preview");
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Upload weekly RM allocation file</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Upload the latest <code>RM - Data.csv</code> export. This creates a new batch and marks the previous one as historical.
      </p>

      <label className="field">
        <span>Batch label</span>
        <input className="input" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} style={{ width: "100%" }} />
      </label>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>RM - Data.csv</div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          {file ? (
            <>
              <span style={{ fontSize: 13, color: "var(--ok)" }}>✓ {file.name}</span>
              <button
                type="button"
                onClick={clearFile}
                style={{ fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                title="Remove file"
              >
                ✕
              </button>
            </>
          ) : (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No file chosen</span>
          )}
        </div>
        {fileError && <div style={{ color: "var(--bad)", fontSize: 12, marginTop: 6 }}>{fileError}</div>}
      </div>

      {parseError && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 10 }}>{parseError}</div>}

      {(phase === "idle" || phase === "previewing") && (
        <button className="btn primary" onClick={handlePreview} disabled={!file || phase === "previewing"}>
          {phase === "previewing" ? "Loading preview…" : "Preview"}
        </button>
      )}

      {phase === "preview" && preview && (
        <>
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            {([
              ["Total rows",                preview.total,                           ""],
              ["Allocations to create",     preview.wouldCreate,                     ""],
              ["Allocations to update",     preview.wouldUpdate,                     ""],
              ["Employees to auto-create",  preview.employeesWouldCreate.length,     "var(--accent)"],
              ["Projects to auto-create",   preview.projectsWouldCreate.length,      "var(--accent)"],
              ["Rows with errors",          preview.errors.length,                   preview.errors.length > 0 ? "var(--bad)" : ""],
            ] as [string, number, string][]).map(([label, val, color]) => (
              <div key={label} className="row" style={{ justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: color || undefined }}>{val}</span>
              </div>
            ))}
          </div>
          {/* Auto-create previews */}
          {preview.employeesWouldCreate.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--accent)", marginBottom: 4 }}>
                {preview.employeesWouldCreate.length} new employee{preview.employeesWouldCreate.length > 1 ? "s" : ""} will be created — click to preview
              </summary>
              <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                {preview.employeesWouldCreate.map((e) => (
                  <div key={e.externalId} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: 60 }}>{e.externalId}</span>
                    <span>{e.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {preview.projectsWouldCreate.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--accent)", marginBottom: 4 }}>
                {preview.projectsWouldCreate.length} new project{preview.projectsWouldCreate.length > 1 ? "s" : ""} will be created — click to preview
              </summary>
              <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                {preview.projectsWouldCreate.map((p) => (
                  <div key={p.externalId} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: 60 }}>{p.externalId}</span>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {preview.errors.length > 0 && (() => {
            const missingEmployees = new Set<string>();
            const missingProjects  = new Set<string>();
            for (const e of preview.errors) {
              const m = e.message.match(/externalId=(\S+)/);
              if (e.message.startsWith("Employee not found") && m) missingEmployees.add(m[1]);
              if (e.message.startsWith("Project not found")  && m) missingProjects.add(m[1]);
            }
            return (
              <div style={{ marginBottom: 12 }}>
                {/* How-to-fix callout */}
                <div style={{ background: "#fff8e1", border: "1px solid #f0b429", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>These rows will be skipped — here's how to fix them</div>
                  {missingProjects.size > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <strong>{missingProjects.size} project{missingProjects.size > 1 ? "s" : ""} not found</strong>
                      {" "}(IDs: {[...missingProjects].join(", ")}) — go to the <strong>Projects</strong> tab and import your Projects CSV first, then re-upload this file.
                    </div>
                  )}
                  {missingEmployees.size > 0 && (
                    <div>
                      <strong>{missingEmployees.size} employee{missingEmployees.size > 1 ? "s" : ""} not found</strong>
                      {" "}(IDs: {[...missingEmployees].join(", ")}) — go to the <strong>Employees</strong> tab and import your Employee CSV first, then re-upload this file.
                    </div>
                  )}
                </div>
                {/* Error detail table */}
                <details>
                  <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--bad)", marginBottom: 6 }}>
                    {preview.errors.length} skipped row{preview.errors.length > 1 ? "s" : ""} — click to see details
                  </summary>
                  <div style={{ marginTop: 8, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["Row", "Employee ID", "Project ID", "Start", "End", "Issue"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.slice(0, 30).map((e, i) => {
                          const row = rows[e.row - 1];
                          const isEmpErr = e.message.startsWith("Employee");
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                              <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{e.row}</td>
                              <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: isEmpErr ? "var(--bad)" : undefined }}>{row?.employeeId ?? "—"}</td>
                              <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: !isEmpErr ? "var(--bad)" : undefined }}>{row?.projectId ?? "—"}</td>
                              <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)" }}>{row?.startDate ?? "—"}</td>
                              <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)" }}>{row?.endDate ?? "—"}</td>
                              <td style={{ padding: "4px 8px", color: "var(--bad)" }}>{e.message}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {preview.errors.length > 30 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 8px" }}>…and {preview.errors.length - 30} more</div>
                    )}
                  </div>
                </details>
              </div>
            );
          })()}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setPhase("idle")}>Back</button>
            <button className="btn primary" onClick={handleConfirm}>Confirm &amp; import</button>
          </div>
        </>
      )}

      {phase === "confirming" && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Importing…</div>
      )}

      {phase === "done" && result && (
        <>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{result.errors.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Import complete</div>

          {/* Stats */}
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
            {([
              ["Allocations created",    result.created,                    ""],
              ["Allocations updated",    result.updated,                    ""],
              ["Employees auto-created", result.employeesAutoCreated.length, result.employeesAutoCreated.length > 0 ? "var(--ok)" : ""],
              ["Projects auto-created",  result.projectsAutoCreated.length,  result.projectsAutoCreated.length  > 0 ? "var(--ok)" : ""],
              ["Errors",                 result.errors.length,               result.errors.length > 0 ? "var(--bad)" : ""],
            ] as [string, number, string][]).map(([label, val, color]) => (
              <div key={label} className="row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: color || undefined }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Auto-created employees */}
          {result.employeesAutoCreated.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--ok)" }}>
                {result.employeesAutoCreated.length} employees auto-created — click to see
              </summary>
              <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                {result.employeesAutoCreated.map((e) => (
                  <div key={e.externalId} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: 60 }}>{e.externalId}</span>
                    <span>{e.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Auto-created projects */}
          {result.projectsAutoCreated.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--ok)" }}>
                {result.projectsAutoCreated.length} projects auto-created — click to see
              </summary>
              <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                {result.projectsAutoCreated.map((p) => (
                  <div key={p.externalId} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: 60 }}>{p.externalId}</span>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--bad)" }}>
                {result.errors.length} rows skipped — click to see
              </summary>
              <div style={{ marginTop: 6 }}>
                {result.errors.slice(0, 20).map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>Row {e.row}: {e.message}</div>
                ))}
                {result.errors.length > 20 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>…and {result.errors.length - 20} more</div>}
              </div>
            </details>
          )}

          <button className="btn" onClick={() => { setPhase("idle"); setFile(null); setPreview(null); setResult(null); setRows([]); if (fileRef.current) fileRef.current.value = ""; }}>
            Upload another
          </button>
        </>
      )}
    </div>
  );
}

// ─── Import History ───────────────────────────────────────────────────────────

type BatchLog = {
  uploadedBy:           string;
  uploadedAt:           string;
  totalRows:            number;
  allocationsCreated:   number;
  allocationsUpdated:   number;
  employeesAutoCreated: AutoCreated[];
  projectsAutoCreated:  AutoCreated[];
  errors:               { row: number; message: string }[];
};

type BatchRecord = {
  id:              string;
  label:           string;
  uploadedAt:      string;
  isCurrent:       boolean;
  sourceFile:      string;
  allocationCount: number;
  uploadedBy:      string;
  log:             BatchLog | null;
};

function ImportHistory() {
  const [batches,  setBatches]  = useState<BatchRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/import/allocations/batches")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBatches(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</div>;
  if (batches.length === 0) return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No import batches found. Run a Weekly Upload to get started.</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      {batches.map((b) => {
        const log      = b.log;
        const isOpen   = expanded === b.id;
        const hasLog   = !!log;
        return (
          <div key={b.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
            {/* Header row */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: hasLog ? "pointer" : "default" }}
              onClick={() => hasLog && setExpanded(isOpen ? null : b.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{b.label}</span>
                  {b.isCurrent && <span className="chip ok" style={{ fontSize: 10 }}>current</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {new Date(b.uploadedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{b.uploadedBy}
                  {" · "}{b.sourceFile}
                </div>
              </div>

              {/* Mini stats */}
              <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16 }}>{b.allocationCount}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>allocations</div>
                </div>
                {log && log.employeesAutoCreated.length > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--ok)" }}>{log.employeesAutoCreated.length}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>new emp</div>
                  </div>
                )}
                {log && log.projectsAutoCreated.length > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--ok)" }}>{log.projectsAutoCreated.length}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>new proj</div>
                  </div>
                )}
                {log && log.errors.length > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--bad)" }}>{log.errors.length}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>skipped</div>
                  </div>
                )}
              </div>

              {hasLog && (
                <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              )}
            </div>

            {/* Expanded log */}
            {isOpen && log && (
              <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", background: "var(--surface-2)" }}>
                {/* Summary grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
                  {([
                    ["Total rows",          log.totalRows,                    ""],
                    ["Created",             log.allocationsCreated,           ""],
                    ["Updated",             log.allocationsUpdated,           ""],
                    ["Employees created",   log.employeesAutoCreated.length,  log.employeesAutoCreated.length > 0 ? "var(--ok)" : ""],
                    ["Projects created",    log.projectsAutoCreated.length,   log.projectsAutoCreated.length  > 0 ? "var(--ok)" : ""],
                    ["Skipped / errors",    log.errors.length,                log.errors.length > 0 ? "var(--bad)" : ""],
                  ] as [string, number, string][]).map(([label, val, color]) => (
                    <div key={label} style={{ background: "var(--surface)", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: color || "var(--text)" }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Auto-created employees */}
                {log.employeesAutoCreated.length > 0 && (
                  <details style={{ marginBottom: 8 }}>
                    <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--ok)", marginBottom: 4 }}>
                      Auto-created employees ({log.employeesAutoCreated.length})
                    </summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {log.employeesAutoCreated.map((e) => (
                        <span key={e.externalId} style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}>
                          {e.name} <span style={{ color: "var(--text-muted)" }}>#{e.externalId}</span>
                        </span>
                      ))}
                    </div>
                  </details>
                )}

                {/* Auto-created projects */}
                {log.projectsAutoCreated.length > 0 && (
                  <details style={{ marginBottom: 8 }}>
                    <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--ok)", marginBottom: 4 }}>
                      Auto-created projects ({log.projectsAutoCreated.length})
                    </summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {log.projectsAutoCreated.map((p) => (
                        <span key={p.externalId} style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}>
                          {p.name} <span style={{ color: "var(--text-muted)" }}>#{p.externalId}</span>
                        </span>
                      ))}
                    </div>
                  </details>
                )}

                {/* Skipped rows */}
                {log.errors.length > 0 && (
                  <details>
                    <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--bad)", marginBottom: 4 }}>
                      Skipped rows ({log.errors.length})
                    </summary>
                    <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
                      {log.errors.slice(0, 30).map((e, i) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
                          Row {e.row}: {e.message}
                        </div>
                      ))}
                      {log.errors.length > 30 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>…and {log.errors.length - 30} more</div>}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stale Allocations ────────────────────────────────────────────────────────

type StaleAllocation = {
  id:             string;
  employeeName:   string;
  projectName:    string;
  startDate:      string;
  endDate:        string;
  allocationPct:  number;
  notes:          string | null;
  lastBatchLabel: string;
  lastUploadedAt: string | null;
};

type StaleData = {
  currentBatch: { id: string; label: string; csvRange: { minStart: string; maxEnd: string } | null } | null;
  withinRange:  StaleAllocation[];
  beyondRange:  StaleAllocation[];
};

function StaleAllocations() {
  const [data,    setData]    = useState<StaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/import/allocations/stale");
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally  { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this allocation? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch("/api/import/allocations/stale", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally { setDeleting(null); }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function StaleTable({ rows, section }: { rows: StaleAllocation[]; section: "A" | "B" }) {
    if (rows.length === 0)
      return <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 0" }}>None</div>;

    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Employee", "Project", "Start", "End", "%", "Last import", "Notes", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.employeeName}</td>
                <td style={{ padding: "6px 8px" }}>{r.projectName}</td>
                <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{fmtDate(r.startDate)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{fmtDate(r.endDate)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{r.allocationPct}%</td>
                <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 11 }}>{r.lastBatchLabel}</td>
                <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 11, maxWidth: 200 }}>{r.notes ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: "3px 10px", color: "var(--bad)", borderColor: "var(--bad)" }}
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                  >
                    {deleting === r.id ? "…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</div>;

  if (!data?.currentBatch) return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No import batch found. Run a Weekly Upload first.</div>
    </div>
  );

  const totalStale = (data.withinRange?.length ?? 0) + (data.beyondRange?.length ?? 0);

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Current batch context */}
      <div className="card" style={{ marginBottom: 16, padding: "10px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Current batch: <strong>{data.currentBatch.label}</strong>
          {data.currentBatch.csvRange && (
            <> · CSV range: <span style={{ fontFamily: "var(--mono)" }}>
              {fmtDate(data.currentBatch.csvRange.minStart)} → {fmtDate(data.currentBatch.csvRange.maxEnd)}
            </span></>
          )}
          {" · "}<strong style={{ color: totalStale > 0 ? "var(--bad)" : "var(--ok)" }}>{totalStale} stale allocation{totalStale !== 1 ? "s" : ""}</strong>
        </div>
      </div>

      {totalStale === 0 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: "var(--ok)" }}>✓ No stale allocations. Everything in the DB matches the latest import.</div>
        </div>
      )}

      {/* Section A — Likely Removed */}
      {(data.withinRange?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Section A — Likely Removed ({data.withinRange.length})
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            These allocations fall within the current CSV&apos;s date range but were not in the import.
            They were most likely removed from the RM Tool. Review and delete if correct.
          </div>
          <StaleTable rows={data.withinRange} section="A" />
        </div>
      )}

      {/* Section B — Outside CSV Range */}
      {(data.beyondRange?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Section B — Outside Import Range — Verify ({data.beyondRange.length})
          </div>
          <div
            style={{
              fontSize: 12, background: "#fff8e1", border: "1px solid #f0b429",
              borderRadius: 6, padding: "8px 12px", marginBottom: 12,
            }}
          >
            ⚠ These allocations start <strong>after the CSV&apos;s end date</strong> ({data.currentBatch.csvRange ? fmtDate(data.currentBatch.csvRange.maxEnd) : "unknown"}).
            The RM Tool may not have exported data that far. They may still be valid — confirm before deleting.
          </div>
          <StaleTable rows={data.beyondRange} section="B" />
        </div>
      )}
    </div>
  );
}

// ─── Overlap Alerts ───────────────────────────────────────────────────────────

type OverlapAllocation = {
  id:            string;
  employeeName:  string;
  projectName:   string;
  startDate:     string;
  endDate:       string;
  allocationPct: number;
  notes:         string | null;
};

function OverlapAlerts() {
  const [items,   setItems]   = useState<OverlapAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch current batch allocations that have an overlap note
    fetch("/api/import/allocations/batches")
      .then((r) => r.json())
      .then(async (batches: { id: string; isCurrent: boolean }[]) => {
        const current = batches.find((b) => b.isCurrent);
        if (!current) { setLoading(false); return; }

        // Fetch allocations for current batch that have overlap notes
        const res  = await fetch(`/api/allocations/view?batchId=${current.id}`);
        const data = await res.json();
        const allUsers: { id: string; name: string | null; email: string | null }[] = data.users ?? [];
        const flagged = (Array.isArray(data) ? data : (data.allocations ?? []))
          .filter((a: { notes?: string }) => a.notes?.includes("Overlap detected"));
        setItems(flagged.map((a: {
          id: string;
          userId?: string;
          user?: { name?: string | null; email?: string | null };
          project?: { name?: string };
          startDate: string;
          endDate: string;
          hoursPerDay: number;
          notes?: string;
        }) => {
          // user relation included by API; fall back to users array if not present
          const userRecord = a.user ?? allUsers.find((u) => u.id === a.userId);
          return {
            id:            a.id,
            employeeName:  userRecord?.name ?? userRecord?.email ?? "Unknown",
            projectName:   a.project?.name ?? "Unknown",
            startDate:     a.startDate,
            endDate:       a.endDate,
            allocationPct: Math.round((a.hoursPerDay / 8) * 100),
            notes:         a.notes ?? null,
          };
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</div>;

  if (items.length === 0) return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: "var(--ok)" }}>✓ No overlap conflicts in the current import.</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Overlap Alerts — {items.length} flagged allocation{items.length !== 1 ? "s" : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          These allocations were imported but their date ranges overlap with another row for the same employee and project
          in the same import file. Both were inserted — review and delete the incorrect one from the{" "}
          <strong>Manage Allocations</strong> page.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Employee", "Project", "Start", "End", "%", "Note"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border-faint)", background: "#fff8e1" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.employeeName}</td>
                  <td style={{ padding: "6px 8px" }}>{r.projectName}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{fmtDate(r.startDate)}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{fmtDate(r.endDate)}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{r.allocationPct}%</td>
                  <td style={{ padding: "6px 8px", color: "var(--text-secondary)", fontSize: 11 }}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Top-level component ─────────────────────────────────────────────────────

export function ImportClient() {
  const { data: session } = useSession();
  const isAdmin         = session?.user?.role === "ADMIN";
  const isDivOwner      = session?.user?.role === "DIVISION_OWNER";
  const canWeeklyUpload = isAdmin || isDivOwner;
  const [tab, setTab]   = useState<"weekly" | "history" | "stale" | "overlaps" | "projects" | "employees" | "rm" | "legacy">(
    canWeeklyUpload ? "weekly" : "legacy"
  );

  type Tab = "weekly" | "history" | "stale" | "overlaps" | "projects" | "employees" | "rm" | "legacy";
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "weekly",    label: "Weekly Upload",         show: canWeeklyUpload },
    { key: "history",   label: "Import History",        show: canWeeklyUpload },
    { key: "stale",     label: "Stale Allocations",     show: canWeeklyUpload },
    { key: "overlaps",  label: "Overlap Alerts",        show: canWeeklyUpload },
    { key: "projects",  label: "Projects",              show: isAdmin },
    { key: "employees", label: "Employees",             show: isAdmin },
    { key: "rm",        label: "Full RM Migration",     show: isAdmin },
    { key: "legacy",    label: "CSV Allocation Import", show: true },
  ];
  const visibleTabs = tabs.filter((t) => t.show);

  return (
    <div className="page" data-screen-label="Import">
      <div className="page-head">
        <h1 className="page-title">Import data</h1>
        <div className="page-sub">Bulk import from RM tool or CSV</div>
      </div>

      {visibleTabs.length > 1 && (
        <div className="row" style={{ gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          {visibleTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
                fontWeight: tab === key ? 600 : 400, fontSize: 14,
                color: tab === key ? "var(--accent)" : "var(--text-muted)",
                borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "weekly"    && <WeeklyUpload />}
      {tab === "history"   && <ImportHistory />}
      {tab === "stale"     && <StaleAllocations />}
      {tab === "overlaps"  && <OverlapAlerts />}
      {tab === "projects"  && <ProjectsImport />}
      {tab === "employees" && <EmployeesImport />}
      {tab === "rm"        && <RMImport />}
      {tab === "legacy"    && <LegacyImport />}
    </div>
  );
}

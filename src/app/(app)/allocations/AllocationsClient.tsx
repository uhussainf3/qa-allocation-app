"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getNextNWeeks, getWeekLabel, getWeekRange, getMondayOf, addWeeks } from "@/lib/weeks";
import type { Role } from "@/types/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

type User       = { id: string; name: string | null; email: string | null; image: string | null; capacity: number; role: Role };
type Project    = { id: string; name: string; code: string; color: string };
type Task       = { id: string; name: string } | null;
type Allocation = {
  id: string; userId: string; projectId: string; taskId: string | null;
  startDate: string; endDate: string; hoursPerDay: number; notes: string | null;
  project: Project; task: Task;
};
type WeekMeta   = { date: string; label: string; range: string; isCurrent: boolean };
type CellEntry  = { hours: number; id: string | null; hoursPerDay: number; startDate: string; endDate: string };
type EditState  = {
  allocationId: string | null; userId: string; projectId: string;
  startDate: string; endDate: string; hoursPerDay: number;
  projName: string; engineerName: string;
};
type Holiday    = { id: string; date: string; name: string };
type ViewData   = { users: User[]; allocations: Allocation[]; projects: Project[]; holidays: Holiday[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_OPTIONS = [
  { value: 4,  label: "4 weeks"  },
  { value: 8,  label: "8 weeks"  },
  { value: 13, label: "3 months" },
  { value: 26, label: "6 months" },
];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(nWeeks: number) { return `alloc-view-${nWeeks}`; }

function readCache(nWeeks: number): ViewData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(nWeeks));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: ViewData };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

function writeCache(nWeeks: number, data: ViewData) {
  try { sessionStorage.setItem(cacheKey(nWeeks), JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
}

function clearCache(nWeeks: number) {
  try { sessionStorage.removeItem(cacheKey(nWeeks)); } catch { /* ignore */ }
}

function buildWeeks(n: number): WeekMeta[] {
  return getNextNWeeks(n).map((w, i) => ({
    date:      w.toISOString(),
    label:     getWeekLabel(w),
    range:     getWeekRange(w),
    isCurrent: i === 0,
  }));
}

function toMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function workingDaysInWeek(
  weekMonISO: string,
  allocStart: string,
  allocEnd:   string,
  holidays?:  Set<string>
): number {
  const wMon   = new Date(weekMonISO + "T00:00:00");
  const wFri   = new Date(wMon); wFri.setDate(wMon.getDate() + 4);
  const aStart = new Date(allocStart + "T00:00:00");
  const aEnd   = new Date(allocEnd   + "T00:00:00");
  const oStart = aStart > wMon ? aStart : wMon;
  const oEnd   = aEnd   < wFri ? aEnd   : wFri;
  if (oStart > oEnd) return 0;
  let days = 0;
  const cur = new Date(oStart);
  while (cur <= oEnd) {
    const d   = cur.getDay();
    const ymd = cur.toISOString().slice(0, 10);
    if (d >= 1 && d <= 5 && !holidays?.has(ymd)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Holiday-aware working-day count for the full Mon–Fri span of a given week. */
function weekWorkingDays(weekMonISO: string, holidays: Set<string>): number {
  const mon = new Date(weekMonISO + "T00:00:00");
  let days = 0;
  for (let i = 0; i < 5; i++) {
    const cur = new Date(mon); cur.setDate(mon.getDate() + i);
    if (!holidays.has(cur.toISOString().slice(0, 10))) days++;
  }
  return days;
}

function statusForPct(pct: number) {
  if (pct === 0) return "idle";
  if (pct > 100) return "bad";
  if (pct >= 90) return "warn";
  return "ok";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AllocCell({ hours, capacity, unit }: { hours: number; capacity: number; unit: string }) {
  const pct    = capacity > 0 ? Math.round((hours / capacity) * 100) : 0;
  const status = statusForPct(pct);
  return (
    <div className={`alloc-cell ${status}`} style={{ width: "100%" }}>
      <div className="figures">
        <span className="hrs">{unit === "pct" ? `${pct}%` : `${hours}h`}</span>
        <span className="pct">{unit === "pct" ? `${hours}h` : `${pct}%`}</span>
      </div>
      <div className="bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

function InlineSkeleton() {
  return (
    <div style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} style={{
          height: 52, borderRadius: 8,
          background: "linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s infinite",
          opacity: 1 - i * 0.06,
        }} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { currentUserRole: Role; }

export function AllocationsClient({ currentUserRole }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeWeeks  = Number(searchParams.get("weeks") ?? 4);

  // Weeks metadata — pure computation, no network
  const weeks    = useMemo(() => buildWeeks(activeWeeks), [activeWeeks]);
  const allWeeks = useMemo(() => buildWeeks(26),          []);

  // Data state
  const [users,       setUsers]       = useState<User[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [holidays,    setHolidays]    = useState<Holiday[]>([]);
  const [loading,     setLoading]     = useState(true);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);

  // ── Conflict detection ────────────────────────────────────────────────────────
  /**
   * Returns a warning string if adding an allocation would over-allocate the
   * engineer in any week, or null if everything is fine.
   * Excludes the allocation being edited (by id) from the baseline.
   */
  function conflictWarning(
    userId: string, startISO: string, endISO: string,
    hpd: number, excludeId?: string | null
  ): string | null {
    if (!userId || !startISO || !endISO || hpd <= 0) return null;
    const user = users.find((u) => u.id === userId);
    if (!user || user.capacity <= 0) return null;

    const existing = allocations.filter(
      (a) => a.userId === userId && a.id !== (excludeId ?? "___")
    );

    const start = new Date(startISO + "T00:00:00");
    const end   = new Date(endISO   + "T00:00:00");
    const overWeeks: string[] = [];

    let wMon = getMondayOf(start);
    let guard = 0;
    while (wMon <= end && guard++ < 104) {
      const wStr   = wMon.toISOString().slice(0, 10);
      const newDays = workingDaysInWeek(wStr, startISO, endISO, holidaySet);
      if (newDays > 0) {
        const wDays  = weekWorkingDays(wStr, holidaySet);
        const effCap = user.capacity * wDays / 5;
        const existH = existing.reduce((s, a) => {
          const d = workingDaysInWeek(wStr, a.startDate.slice(0, 10), a.endDate.slice(0, 10), holidaySet);
          return s + d * a.hoursPerDay;
        }, 0);
        if (existH + newDays * hpd > effCap) {
          overWeeks.push(wMon.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
        }
      }
      wMon = addWeeks(wMon, 1);
    }

    if (overWeeks.length === 0) return null;
    const shown = overWeeks.slice(0, 3).join(", ");
    const extra = overWeeks.length > 3 ? ` +${overWeeks.length - 3} more` : "";
    return `⚠ Over capacity in ${overWeeks.length} week${overWeeks.length !== 1 ? "s" : ""}: ${shown}${extra}`;
  }

  // UI state
  const [unit,          setUnit]          = useState<"hrs" | "pct">("hrs");
  const [expanded,      setExpanded]      = useState<Record<string, boolean>>({});
  const [showNewModal,  setShowNewModal]  = useState(false);
  const [editState,     setEditState]     = useState<EditState | null>(null);
  const [editHours,     setEditHours]     = useState(0);
  const [editSaving,    setEditSaving]    = useState(false);
  const [saving,        setSaving]        = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [newAlloc, setNewAlloc] = useState({
    userId: "", projectId: "", startDate: todayStr, endDate: todayStr, hoursPerDay: 8,
  });

  const canEdit = currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  // Derived conflict warnings — computed after all state is declared
  const newAllocConflict = useMemo(
    () => conflictWarning(newAlloc.userId, newAlloc.startDate, newAlloc.endDate, newAlloc.hoursPerDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newAlloc.userId, newAlloc.startDate, newAlloc.endDate, newAlloc.hoursPerDay, allocations, holidaySet]
  );

  const editConflict = useMemo(
    () => conflictWarning(
      editState?.userId ?? "", editState?.startDate ?? "",
      editState?.endDate ?? "", editHours, editState?.allocationId
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editState?.userId, editState?.startDate, editState?.endDate, editHours, editState?.allocationId, allocations, holidaySet]
  );

  // ── Fetch + cache ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (nWeeks: number, background = false) => {
    if (!background) setLoading(true);
    try {
      const res  = await fetch(`/api/allocations/view?weeks=${nWeeks}`);
      if (!res.ok) throw new Error("Failed");
      const data: ViewData = await res.json();
      setUsers(data.users);
      setAllocations(data.allocations);
      setProjects(data.projects);
      setHolidays(data.holidays ?? []);
      writeCache(nWeeks, data);
    } catch {
      // keep whatever is in state already
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache(activeWeeks);
    if (cached) {
      // Show instantly from cache, then revalidate silently in background
      setUsers(cached.users);
      setAllocations(cached.allocations);
      setProjects(cached.projects);
      setHolidays(cached.holidays ?? []);
      setLoading(false);
      fetchData(activeWeeks, true); // background refresh
    } else {
      fetchData(activeWeeks, false);
    }
  }, [activeWeeks, fetchData]);

  // ── Refresh helper (after mutations) ────────────────────────────────────────
  const refresh = useCallback(async () => {
    clearCache(activeWeeks);
    await fetchData(activeWeeks, false);
  }, [activeWeeks, fetchData]);

  // ── Grid logic ───────────────────────────────────────────────────────────────
  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const allocMap = useMemo(() => {
    const m: Record<string, Record<string, CellEntry[]>> = {};
    users.forEach((u) => { m[u.id] = {}; });
    allocations.forEach((a) => {
      if (!m[a.userId]) m[a.userId] = {};
      const key = `${a.projectId}__${a.taskId ?? ""}`;
      if (!m[a.userId][key]) {
        m[a.userId][key] = weeks.map(() => ({ hours: 0, id: null, hoursPerDay: 0, startDate: "", endDate: "" }));
      }
      weeks.forEach((w, wIdx) => {
        const days = workingDaysInWeek(w.date.slice(0, 10), a.startDate.slice(0, 10), a.endDate.slice(0, 10), holidaySet);
        if (days > 0) {
          const prev = m[a.userId][key][wIdx];
          m[a.userId][key][wIdx] = {
            hours:       prev.hours + Math.round(days * a.hoursPerDay * 10) / 10,
            id:          a.id,
            hoursPerDay: a.hoursPerDay,
            startDate:   a.startDate.slice(0, 10),
            endDate:     a.endDate.slice(0, 10),
          };
        }
      });
    });
    return m;
  }, [allocations, users, weeks, holidaySet]);

  const userWeekHours  = (userId: string, wIdx: number) =>
    Object.values(allocMap[userId] ?? {}).reduce((s, arr) => s + (arr[wIdx]?.hours ?? 0), 0);
  const userTotalHours = (userId: string) =>
    weeks.reduce((s, _, i) => s + userWeekHours(userId, i), 0);
  const weekTotals     = weeks.map((w, i) => {
    const h     = users.reduce((s, u) => s + userWeekHours(u.id, i), 0);
    const wDays = weekWorkingDays(w.date.slice(0, 10), holidaySet);
    const cap   = users.reduce((s, u) => s + u.capacity * wDays / 5, 0);
    return { h, cap: Math.round(cap), pct: cap > 0 ? Math.round((h / cap) * 100) : 0 };
  });
  const grandH    = weekTotals.reduce((s, t) => s + t.h, 0);
  const grandCap  = weekTotals.reduce((s, t) => s + t.cap, 0);
  const grandPct  = grandCap > 0 ? Math.round((grandH / grandCap) * 100) : 0;
  const overCount = users.reduce((s, u) =>
    s + weeks.reduce((x, w, i) => {
      const wDays  = weekWorkingDays(w.date.slice(0, 10), holidaySet);
      const effCap = u.capacity * wDays / 5;
      return x + (effCap > 0 && userWeekHours(u.id, i) > effCap ? 1 : 0);
    }, 0), 0);

  const initials = (name: string | null, email: string | null) =>
    (name ?? email ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  // ── Edit handlers ─────────────────────────────────────────────────────────────
  function openEdit(entry: CellEntry, userId: string, projectId: string, projName: string, engineerName: string) {
    if (!canEdit) return;
    setEditState({
      allocationId: entry.id, userId, projectId,
      startDate:   entry.startDate || toMonday(new Date().toISOString().slice(0, 10)),
      endDate:     entry.endDate   || toMonday(new Date().toISOString().slice(0, 10)),
      hoursPerDay: entry.hoursPerDay || 8,
      projName, engineerName,
    });
    setEditHours(entry.hoursPerDay || 8);
  }

  async function handleEditSave() {
    if (!editState) return;
    setEditSaving(true);
    try {
      if (editState.allocationId) {
        await fetch(`/api/allocations/${editState.allocationId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: editState.startDate, endDate: editState.endDate, hoursPerDay: editHours }),
        });
      } else {
        await fetch("/api/allocations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: editState.userId, projectId: editState.projectId, startDate: editState.startDate, endDate: editState.endDate, hoursPerDay: editHours }),
        });
      }
      setEditState(null);
      await refresh();
    } finally { setEditSaving(false); }
  }

  async function handleEditDelete() {
    if (!editState?.allocationId) return;
    if (!confirm("Delete this allocation?")) return;
    setEditSaving(true);
    try {
      await fetch(`/api/allocations/${editState.allocationId}`, { method: "DELETE" });
      setEditState(null);
      await refresh();
    } finally { setEditSaving(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newAlloc.userId, projectId: newAlloc.projectId, startDate: newAlloc.startDate, endDate: newAlloc.endDate, hoursPerDay: newAlloc.hoursPerDay }),
      });
      setShowNewModal(false);
      await refresh();
    } finally { setSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page" data-screen-label="Allocations">
      <div className="page-head">
        <div>
          <h1 className="page-title">Allocations</h1>
          <div className="page-sub">
            {loading ? "Loading…" : `${users.length} engineers · ${WEEK_OPTIONS.find((o) => o.value === activeWeeks)?.label ?? `${activeWeeks} weeks`}`}
          </div>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button className={unit === "hrs" ? "active" : ""} onClick={() => setUnit("hrs")}>Hours</button>
            <button className={unit === "pct" ? "active" : ""} onClick={() => setUnit("pct")}>%</button>
          </div>
          <select className="select-sm" value={activeWeeks} onChange={(e) => router.push(`?weeks=${e.target.value}`)}>
            {WEEK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canEdit && (
            <button className="btn primary" onClick={() => setShowNewModal(true)}>+ New allocation</button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Team capacity · {weeks.length} wks</div>
          <div className="kpi-value">{grandCap}<span className="unit">h</span></div>
          <div className="kpi-meta">Across {users.length} engineers</div>
        </div>
        <div className={`kpi ${grandPct > 100 ? "bad" : grandPct >= 90 ? "warn" : ""}`}>
          <div className="kpi-label">Demand</div>
          <div className="kpi-value">{grandH}<span className="unit">h</span></div>
          <div className="kpi-meta"><span className="chip">{grandPct}%</span> of capacity</div>
        </div>
        <div className={`kpi ${overCount ? "bad" : "ok"}`}>
          <div className="kpi-label">Over-allocations</div>
          <div className="kpi-value">{overCount}<span className="unit">cells</span></div>
          <div className="kpi-meta">Engineers over 100% in any week</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Idle bandwidth</div>
          <div className="kpi-value">{Math.max(0, grandCap - grandH)}<span className="unit">h</span></div>
          <div className="kpi-meta">Available for new work</div>
        </div>
      </div>

      {/* Grid or inline skeleton */}
      {loading && users.length === 0 ? (
        <div className="card"><InlineSkeleton /></div>
      ) : (
        <>
          <div className="grid-wrap">
            <div className="alloc-grid" style={{ gridTemplateColumns: `260px repeat(${weeks.length}, minmax(120px, 1fr)) 120px` }}>
              {/* Header */}
              <div className="ag-cell ag-head">Engineer</div>
              {weeks.map((w) => (
                <div key={w.date} className="ag-cell ag-head">
                  <div className="week-head">
                    <span>{w.label}{w.isCurrent ? " · current" : ""}</span>
                    <span className="wk-range">{w.range}</span>
                  </div>
                </div>
              ))}
              <div className="ag-cell ag-head" style={{ justifyContent: "flex-end" }}>{weeks.length}-wk total</div>

              {/* Engineer rows */}
              {users.map((u) => {
                const open     = expanded[u.id];
                const totalH   = userTotalHours(u.id);
                const totalCap = Math.round(weeks.reduce((s, w) => {
                  const wDays = weekWorkingDays(w.date.slice(0, 10), holidaySet);
                  return s + u.capacity * wDays / 5;
                }, 0));
                const totalPct = totalCap > 0 ? Math.round((totalH / totalCap) * 100) : 0;
                const lines    = Object.entries(allocMap[u.id] ?? {});
                return (
                  <>
                    <div key={`person-${u.id}`} className="ag-cell ag-row-person" onClick={() => toggle(u.id)} style={{ gap: 6, cursor: "pointer" }}>
                      <span className={`caret ${open ? "open" : ""}`}>›</span>
                      <div className="person">
                        <span className="avatar">{initials(u.name, u.email)}</span>
                        <div>
                          <div className="person-name">{u.name}</div>
                          <div className="person-role">{u.role.replace("_", " ")} · {u.capacity}h/wk</div>
                        </div>
                      </div>
                    </div>
                    {weeks.map((w, wIdx) => (
                      <div key={`${u.id}-w${wIdx}`} className="ag-cell ag-row-person" style={{ padding: 0 }}>
                        <AllocCell
                          hours={userWeekHours(u.id, wIdx)}
                          capacity={Math.round(u.capacity * weekWorkingDays(w.date.slice(0, 10), holidaySet) / 5)}
                          unit={unit}
                        />
                      </div>
                    ))}
                    <div key={`total-${u.id}`} className="ag-cell ag-row-person" style={{ padding: 0 }}>
                      <div className={`total-cell ${totalPct > 100 ? "bad" : ""}`}>
                        <span className="t-h">{totalH}h</span>
                        <span className="t-p">{totalPct}% · cap {totalCap}h</span>
                      </div>
                    </div>

                    {open && lines.map(([key, entries]) => {
                      const [projectId] = key.split("__");
                      const proj = projects.find((p) => p.id === projectId);
                      if (!proj) return null;
                      return (
                        <>
                          <div key={`task-name-${key}`} className="ag-cell ag-row-task">
                            <div className="row-task-name">
                              <span className="proj-dot" style={{ background: proj.color }} />
                              <div style={{ color: "var(--text)" }}>{proj.name}</div>
                            </div>
                          </div>
                          {entries.map((entry, wIdx) => (
                            <div
                              key={`task-${key}-${wIdx}`}
                              className={`ag-cell ag-row-task${canEdit ? " editable-cell" : ""}`}
                              style={{ padding: "0 var(--pad-x)", fontSize: 12, cursor: canEdit ? "pointer" : "default" }}
                              onClick={() => canEdit && openEdit(entry, u.id, projectId, proj.name, u.name ?? u.email ?? "?")}
                              title={canEdit ? "Click to edit" : undefined}
                            >
                              {entry.hours > 0 ? `${entry.hours}h` : <span className="muted" style={{ color: "var(--text-muted)" }}>-</span>}
                              {canEdit && entry.hours === 0 && <span className="edit-hint" style={{ marginLeft: 4, opacity: 0.4, fontSize: 10 }}>+</span>}
                            </div>
                          ))}
                          <div key={`task-sum-${key}`} className="ag-cell ag-row-task" style={{ justifyContent: "flex-end" }}>
                            <span className="mono" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                              {entries.reduce((s, e) => s + e.hours, 0)}h
                            </span>
                          </div>
                        </>
                      );
                    })}
                  </>
                );
              })}

              {/* Team total row */}
              <div className="ag-cell" style={{ background: "var(--surface-2)", fontWeight: 600 }}>Team total</div>
              {weekTotals.map((t, i) => (
                <div key={`total-${i}`} className="ag-cell" style={{ background: "var(--surface-2)", padding: 0 }}>
                  <div className="alloc-cell" style={{ width: "100%" }}>
                    <div className="figures">
                      <span className="hrs">{t.h}h</span>
                      <span className="pct">{t.pct}% · cap {t.cap}h</span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${Math.min(100, t.pct)}%`, background: t.pct > 100 ? "var(--bad)" : t.pct >= 90 ? "var(--warn)" : "var(--ok)" }} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="ag-cell" style={{ background: "var(--surface-2)", padding: 0 }}>
                <div className="total-cell">
                  <span className="t-h">{grandH}h</span>
                  <span className="t-p">{grandPct}% of {grandCap}h</span>
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 16, marginTop: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <span className="row" style={{ gap: 6 }}><span className="chip-dot" style={{ background: "var(--ok)" }} /> Healthy &lt; 90%</span>
            <span className="row" style={{ gap: 6 }}><span className="chip-dot" style={{ background: "var(--warn)" }} /> Near cap 90–100%</span>
            <span className="row" style={{ gap: 6 }}><span className="chip-dot" style={{ background: "var(--bad)" }} /> Over &gt; 100%</span>
            <span className="row" style={{ gap: 6 }}><span className="chip-dot" style={{ background: "var(--idle)" }} /> Idle</span>
          </div>
        </>
      )}

      {/* Edit Allocation Modal */}
      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editState.allocationId ? "Edit Allocation" : "Set Allocation"}</h2>
              <button className="iconbtn" onClick={() => setEditState(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{editState.engineerName} / {editState.projName}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginTop: 2 }}>{editState.startDate} to {editState.endDate}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={editState.startDate} onChange={(e) => setEditState((s) => s ? { ...s, startDate: e.target.value } : s)} />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={editState.endDate} min={editState.startDate} onChange={(e) => setEditState((s) => s ? { ...s, endDate: e.target.value } : s)} />
                </label>
              </div>
              <label className="field">
                <span>Hours per day</span>
                <input type="number" min={1} max={24} value={editHours} autoFocus
                  onChange={(e) => setEditHours(Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditState(null); }} />
              </label>
              {editConflict && (
                <div style={{ padding: "8px 12px", background: "var(--warn-soft, #fef3c7)", borderRadius: 6, fontSize: 12, color: "var(--warn-dark, #92400e)", marginTop: 4 }}>
                  {editConflict}
                </div>
              )}
              <div className="modal-foot" style={{ justifyContent: "space-between" }}>
                <div>{editState.allocationId && <button type="button" className="btn danger" disabled={editSaving} onClick={handleEditDelete}>Delete</button>}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setEditState(null)}>Cancel</button>
                  <button type="button" className="btn primary" disabled={editSaving} onClick={handleEditSave}>{editSaving ? "Saving…" : "Save"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Allocation Modal */}
      {showNewModal && (
        <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>New Allocation</h2>
              <button className="iconbtn" onClick={() => setShowNewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <label className="field">
                <span>Engineer</span>
                <select value={newAlloc.userId} onChange={(e) => setNewAlloc((s) => ({ ...s, userId: e.target.value }))} required>
                  <option value="">Select engineer…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Project</span>
                <select value={newAlloc.projectId} onChange={(e) => setNewAlloc((s) => ({ ...s, projectId: e.target.value }))} required>
                  <option value="">Select project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={newAlloc.startDate}
                    onChange={(e) => setNewAlloc((s) => ({ ...s, startDate: e.target.value, endDate: s.endDate < e.target.value ? e.target.value : s.endDate }))} required />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={newAlloc.endDate} min={newAlloc.startDate}
                    onChange={(e) => setNewAlloc((s) => ({ ...s, endDate: e.target.value }))} required />
                </label>
              </div>
              <label className="field">
                <span>Hours per day</span>
                <input type="number" min={1} max={24} value={newAlloc.hoursPerDay}
                  onChange={(e) => setNewAlloc((s) => ({ ...s, hoursPerDay: Number(e.target.value) }))} required />
              </label>
              {newAllocConflict && (
                <div style={{ padding: "8px 12px", background: "var(--warn-soft, #fef3c7)", borderRadius: 6, fontSize: 12, color: "var(--warn-dark, #92400e)" }}>
                  {newAllocConflict}
                </div>
              )}
              <div className="modal-foot">
                <button type="button" className="btn" onClick={() => setShowNewModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@/types/enums";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TaskUser   = { id: string; name: string | null };
type Subtask    = {
  id: string; name: string; description: string | null;
  parentId: string | null;
  assignedUserId: string | null; assignedUser: TaskUser | null;
  status: string; priority: string;
  estimatedHours: number; actualHours: number;
  dueDate: string | null; jiraKey: string | null;
  order: number;
};
type Task = Subtask & { subtasks: Subtask[] };

type EngineerBreakdown = { userId: string; userName: string | null; hoursToDate: number; totalAllocated: number };
type Project = {
  id: string; name: string; code: string; description: string | null;
  clientName: string | null; status: string; sanctionedHours: number; hourlyRate: number | null;
  startDate: string | null; endDate: string | null; color: string;
  divisionId: string | null; managerId: string | null;
  consumedHours: number; allocatedHours: number; hoursToDate: number;
  engineerBreakdown: EngineerBreakdown[];
  tasks: { id: string; name: string; estimatedHours: number; subtasks: { id: string; name: string; estimatedHours: number }[] }[];
  _count: { allocations: number; hoursLogs: number };
};

type TeamMember   = { id: string; name: string | null; role?: string; department?: string | null };
type DivisionRef  = { id: string; name: string; code: string; color: string };

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "ok", ON_HOLD: "warn", COMPLETED: "idle", CANCELLED: "bad",
};
const COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

const TASK_STATUS_META: Record<string, { label: string; chip: string }> = {
  TODO:        { label: "To Do",       chip: "chip" },
  IN_PROGRESS: { label: "In Progress", chip: "chip chip-warn" },
  IN_REVIEW:   { label: "In Review",   chip: "chip chip-warn" },
  DONE:        { label: "Done",        chip: "chip chip-ok" },
  BLOCKED:     { label: "Blocked",     chip: "chip chip-bad" },
};
const TASK_STATUSES = ["TODO","IN_PROGRESS","IN_REVIEW","DONE","BLOCKED"];

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW:      { label: "Low",      color: "var(--text-muted)" },
  MEDIUM:   { label: "Medium",   color: "var(--warn)" },
  HIGH:     { label: "High",     color: "#f97316" },
  CRITICAL: { label: "Critical", color: "var(--bad)" },
};
const PRIORITIES = ["LOW","MEDIUM","HIGH","CRITICAL"];

const BLANK_TASK = {
  name: "", description: "", assignedUserId: "",
  status: "TODO", priority: "MEDIUM",
  estimatedHours: 0, dueDate: "", parentId: "",
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props { projects: Project[]; currentUserRole: Role; teamMembers: TeamMember[]; divisions: DivisionRef[]; }

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectsClient({ projects: initialProjects, currentUserRole, teamMembers, divisions }: Props) {
  const router  = useRouter();
  const canEdit = ["ADMIN", "DIVISION_OWNER", "PROJECT_MANAGER"].includes(currentUserRole);

  // Deep link from the Executive Dashboard: /projects?search=<code> pre-fills
  // the search box and selects that project's card.
  const searchParams  = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";

  const [divisionFilter, setDivisionFilter] = useState("");
  const [pmFilter,       setPmFilter]       = useState("");
  const [searchQuery,    setSearchQuery]    = useState(initialSearch);
  const [projects,       setProjects]       = useState<Project[]>(initialProjects);
  const [selected,      setSelected]      = useState<Project | null>(() => {
    if (initialSearch) {
      const match = initialProjects.find((p) => p.code.toLowerCase() === initialSearch.toLowerCase());
      if (match) return match;
    }
    return initialProjects[0] ?? null;
  });
  const [activeTab,     setActiveTab]     = useState<"overview"|"tasks">("overview");
  const [showModal,     setShowModal]     = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form,          setForm]          = useState({ name:"", code:"", clientName:"", sanctionedHours:0, hourlyRate:0, color:COLORS[0], status:"ACTIVE", startDate:"", endDate:"", description:"", divisionId:"", managerId:"" });
  const [editForm,      setEditForm]      = useState({ name:"", clientName:"", sanctionedHours:0, hourlyRate:0, color:COLORS[0], status:"ACTIVE", startDate:"", endDate:"", description:"", divisionId:"", managerId:"" });
  const [saving,        setSaving]        = useState(false);
  const [editSaving,    setEditSaving]    = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ── Tasks state ───────────────────────────────────────────────────────────
  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [tasksLoading,  setTasksLoading]  = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTask,      setEditTask]      = useState<Task | Subtask | null>(null);
  const [taskForm,      setTaskForm]      = useState(BLANK_TASK);
  const [taskSaving,    setTaskSaving]    = useState(false);

  // ── Load tasks when project or tab changes ────────────────────────────────
  const loadTasks = useCallback(async (projectId: string) => {
    setTasksLoading(true);
    try {
      const r = await fetch(`/api/tasks?projectId=${projectId}`);
      if (r.ok) setTasks(await r.json());
    } finally { setTasksLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && activeTab === "tasks") loadTasks(selected.id);
  }, [selected?.id, activeTab, loadTasks]);

  // ── Project CRUD ──────────────────────────────────────────────────────────
  function selectProject(p: Project) { setSelected(p); setShowBreakdown(false); }

  function openEdit() {
    if (!selected) return;
    setEditForm({
      name: selected.name, clientName: selected.clientName ?? "",
      sanctionedHours: selected.sanctionedHours, hourlyRate: selected.hourlyRate ?? 0, color: selected.color,
      status: selected.status,
      startDate: selected.startDate?.slice(0,10) ?? "",
      endDate:   selected.endDate?.slice(0,10)   ?? "",
      description: selected.description ?? "",
      divisionId: selected.divisionId ?? "",
      managerId:  selected.managerId  ?? "",
    });
    setShowEditModal(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/projects/${selected.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, sanctionedHours: Number(editForm.sanctionedHours), hourlyRate: Number(editForm.hourlyRate), startDate: editForm.startDate||null, endDate: editForm.endDate||null, divisionId: editForm.divisionId||null, managerId: editForm.managerId||null }),
      });
      if (res.ok) { setShowEditModal(false); router.refresh(); }
    } finally { setEditSaving(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({...form, sanctionedHours: Number(form.sanctionedHours), hourlyRate: Number(form.hourlyRate), divisionId: form.divisionId||null, managerId: form.managerId||null}) });
      if (res.ok) { setShowModal(false); router.refresh(); }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await fetch(`/api/projects/${id}`, { method:"DELETE" });
    router.refresh();
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  function openCreateTask(parentId?: string) {
    setEditTask(null);
    setTaskForm({ ...BLANK_TASK, parentId: parentId ?? "" });
    setShowTaskModal(true);
  }

  function openEditTask(t: Task | Subtask) {
    setEditTask(t);
    setTaskForm({
      name:           t.name,
      description:    t.description ?? "",
      assignedUserId: t.assignedUserId ?? "",
      status:         t.status,
      priority:       t.priority,
      estimatedHours: t.estimatedHours,
      dueDate:        t.dueDate?.slice(0,10) ?? "",
      parentId:       t.parentId ?? "",
    });
    setShowTaskModal(true);
  }

  async function handleSaveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setTaskSaving(true);
    try {
      const body = {
        ...taskForm,
        projectId:      selected.id,
        estimatedHours: Number(taskForm.estimatedHours) || 0,
        assignedUserId: taskForm.assignedUserId || null,
        dueDate:        taskForm.dueDate        || null,
        parentId:       taskForm.parentId       || null,
        description:    taskForm.description    || null,
      };
      const url    = editTask ? `/api/tasks/${editTask.id}` : "/api/tasks";
      const method = editTask ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (res.ok) { setShowTaskModal(false); loadTasks(selected.id); }
    } finally { setTaskSaving(false); }
  }

  async function handleDeleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method:"DELETE" });
    if (selected) loadTasks(selected.id);
  }

  async function patchTaskStatus(id: string, status: string) {
    await fetch(`/api/tasks/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status }) });
    if (selected) loadTasks(selected.id);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // Project managers — anyone who manages at least one project shows up as a filter option
  const pmOptions = useMemo(() => {
    const managerIds = new Set(projects.map((p) => p.managerId).filter(Boolean) as string[]);
    return teamMembers
      .filter((m) => managerIds.has(m.id))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [projects, teamMembers]);

  // Project manager candidates for the create/edit forms — anyone with the PROJECT_MANAGER role
  const pmCandidates = useMemo(() => (
    teamMembers
      .filter((m) => m.role === "PROJECT_MANAGER")
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
  ), [teamMembers]);

  // Visible projects — division, PM, and name/code search filters combined
  const visibleProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (divisionFilter && p.divisionId !== divisionFilter) return false;
      if (pmFilter       && p.managerId  !== pmFilter)       return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, divisionFilter, pmFilter, searchQuery]);

  // ── Department summary tiles — sums for the currently selected project only ──
  const deptSummary = useMemo(() => {
    if (!selected) return [];
    const deptMap  = new Map<string, { hoursToDate: number; totalAllocated: number }>();
    const userDept = new Map(teamMembers.map((m) => [m.id, m.department ?? null]));

    for (const e of selected.engineerBreakdown) {
      const dept = userDept.get(e.userId);
      if (!dept) continue;
      const existing = deptMap.get(dept) ?? { hoursToDate: 0, totalAllocated: 0 };
      deptMap.set(dept, {
        hoursToDate:    existing.hoursToDate    + e.hoursToDate,
        totalAllocated: existing.totalAllocated + e.totalAllocated,
      });
    }

    return [...deptMap.entries()]
      .map(([dept, vals]) => ({
        dept,
        hoursToDate:    Math.round(vals.hoursToDate    * 10) / 10,
        totalAllocated: Math.round(vals.totalAllocated * 10) / 10,
      }))
      .sort((a, b) => b.totalAllocated - a.totalAllocated);
  }, [selected, teamMembers]);

  const proj       = selected;
  const remaining  = proj ? proj.sanctionedHours - proj.consumedHours : 0;
  const usedPct    = proj?.sanctionedHours ? Math.round(proj.consumedHours  / proj.sanctionedHours * 100) : 0;
  const allocPct   = proj?.sanctionedHours ? Math.round(proj.allocatedHours / proj.sanctionedHours * 100) : 0;
  const toDatePct  = proj?.sanctionedHours ? Math.round(proj.hoursToDate    / proj.sanctionedHours * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page" data-screen-label="Projects">
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="page-sub">{visibleProjects.length} of {projects.length} projects</div>
        </div>
        <div className="page-actions">
          <div className="search" style={{ width:220 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search project name or code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border:0, outline:0, flex:1, background:"transparent", fontSize:13 }}
            />
          </div>
          {pmOptions.length > 0 && (
            <select className="select-sm" value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
              <option value="">All managers</option>
              {pmOptions.map((m) => <option key={m.id} value={m.id}>{m.name ?? "Unnamed"}</option>)}
            </select>
          )}
          {divisions.length > 0 && (
            <select className="select-sm" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          )}
          {canEdit && <button className="btn primary" onClick={() => setShowModal(true)}>+ New project</button>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:16, height:"calc(100vh - 180px)" }}>

        {/* ── Project list ── */}
        <div className="card" style={{ overflow:"auto" }}>
          {visibleProjects.length === 0 && (
            <div style={{ padding:"24px 14px", textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>
              No projects match your filters.
            </div>
          )}
          {visibleProjects.map((p) => (
            <div key={p.id} onClick={() => selectProject(p)} title={p.name} style={{
              display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px",
              cursor:"pointer", borderRadius:6,
              background: selected?.id === p.id ? "var(--accent-soft)" : "transparent",
            }}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:p.color, flexShrink:0, marginTop:4 }} />
              <div style={{ overflow:"hidden", minWidth:0, flex:1 }}>
                <div style={{
                  fontWeight:500, fontSize:13, lineHeight:1.35,
                  display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                  overflow:"hidden", wordBreak:"break-word",
                }}>{p.name}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:"var(--text-muted)" }}>{p.code}</span>
                  <span className={`chip chip-${STATUS_COLORS[p.status]}`} style={{ fontSize:10 }}>
                    {p.status.replace("_"," ")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Detail panel ── */}
        {proj ? (
          <div className="card" style={{ overflow:"auto", display:"flex", flexDirection:"column" }}>

            {/* Project header */}
            <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:16 }}>
              <span style={{ width:14, height:14, borderRadius:"50%", background:proj.color, marginTop:4 }} />
              <div style={{ flex:1 }}>
                <h2 style={{ fontSize:20, fontWeight:600 }}>{proj.name}</h2>
                <div style={{ color:"var(--text-muted)", fontSize:13, marginTop:4 }}>
                  {proj.code}{proj.clientName && ` · ${proj.clientName}`}
                  {proj.startDate && ` · ${new Date(proj.startDate).toLocaleDateString()}`}
                  {proj.endDate   && ` → ${new Date(proj.endDate).toLocaleDateString()}`}
                </div>
              </div>
              {canEdit && (
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn sm" onClick={openEdit}>Edit</button>
                  <button className="btn sm" style={{ color:"var(--bad)" }} onClick={() => handleDelete(proj.id)}>Delete</button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:20 }}>
              {(["overview","tasks"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding:"8px 18px", border:"none", background:"transparent",
                  borderBottom: activeTab===tab ? "2px solid var(--accent)" : "2px solid transparent",
                  color: activeTab===tab ? "var(--accent)" : "var(--text-secondary)",
                  fontWeight:500, fontSize:13, cursor:"pointer", textTransform:"capitalize",
                }}>
                  {tab === "tasks" ? `Tasks (${tasks.length})` : "Overview"}
                </button>
              ))}
            </div>

            {/* ── Overview tab ── */}
            {activeTab === "overview" && (
              <>
                <div className="kpis" style={{ marginBottom:20 }}>
                  <div className="kpi">
                    <div className="kpi-label">Sanctioned</div>
                    <div className="kpi-value">{proj.sanctionedHours}<span className="unit">h</span></div>
                  </div>
                  <div className={`kpi ${usedPct>100?"bad":usedPct>=80?"warn":""}`}>
                    <div className="kpi-label">Consumed</div>
                    <div className="kpi-value">{proj.consumedHours}<span className="unit">h</span></div>
                    <div className="kpi-meta"><span className="chip">{usedPct}%</span> used</div>
                  </div>
                  <div className={`kpi ${remaining<0?"bad":""}`}>
                    <div className="kpi-label">Remaining</div>
                    <div className="kpi-value">{remaining}<span className="unit">h</span></div>
                  </div>
                  <div className={`kpi ${allocPct>100?"bad":allocPct>=80?"warn":""}`}>
                    <div className="kpi-label">Allocated</div>
                    <div className="kpi-value">{proj.allocatedHours}<span className="unit">h</span></div>
                    <div className="kpi-meta"><span className="chip">{allocPct}%</span> of sanctioned · {proj._count.allocations} allocation{proj._count.allocations!==1?"s":""}</div>
                  </div>
                  <div className="kpi" style={{ cursor: proj.engineerBreakdown.length>0?"pointer":"default", userSelect:"none" }}
                    onClick={() => proj.engineerBreakdown.length>0 && setShowBreakdown(v=>!v)}>
                    <div className="kpi-label">Hours to Date</div>
                    <div className="kpi-value">{proj.hoursToDate}<span className="unit">h</span></div>
                    {proj.engineerBreakdown.length>0 && (
                      <div className="kpi-meta">
                        {proj.sanctionedHours>0 && <><span className="chip">{toDatePct}%</span>{" "}</>}
                        {showBreakdown?"▲ hide":"▼ by engineer"}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Department breakdown tiles ── */}
                {deptSummary.length > 0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
                      By Role
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      {deptSummary.map(({ dept, hoursToDate, totalAllocated }) => (
                        <div key={dept} style={{
                          flex:"1 1 140px", maxWidth:200,
                          padding:"10px 14px", borderRadius:8,
                          border:"1px solid var(--border)",
                          background:"var(--bg)",
                        }}>
                          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {dept}
                          </div>
                          <div style={{ display:"flex", gap:16, marginBottom: totalAllocated > 0 ? 8 : 0 }}>
                            <div>
                              <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:1 }}>To Date</div>
                              <div style={{ fontSize:16, fontWeight:700, fontFamily:"var(--mono)" }}>
                                {Math.round(hoursToDate)}<span style={{ fontSize:10, fontWeight:400, marginLeft:1 }}>h</span>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:1 }}>Allocated</div>
                              <div style={{ fontSize:16, fontWeight:700, fontFamily:"var(--mono)" }}>
                                {Math.round(totalAllocated)}<span style={{ fontSize:10, fontWeight:400, marginLeft:1 }}>h</span>
                              </div>
                            </div>
                          </div>
                          {totalAllocated > 0 && (
                            <>
                              <div style={{ height:3, background:"var(--surface-2)", borderRadius:2 }}>
                                <div style={{
                                  height:3, borderRadius:2,
                                  width:`${Math.min(Math.round(hoursToDate / totalAllocated * 100), 100)}%`,
                                  background:"var(--accent)", transition:"width 0.3s",
                                }} />
                              </div>
                              <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:3 }}>
                                {Math.round(hoursToDate / totalAllocated * 100)}% utilised
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showBreakdown && proj.engineerBreakdown.length>0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>Engineer Breakdown</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid var(--border)" }}>
                          <th style={{ textAlign:"left",  padding:"6px 8px", fontWeight:500, color:"var(--text-muted)" }}>Engineer</th>
                          <th style={{ textAlign:"right", padding:"6px 8px", fontWeight:500, color:"var(--text-muted)" }}>To Date</th>
                          <th style={{ textAlign:"right", padding:"6px 8px", fontWeight:500, color:"var(--text-muted)" }}>Total Allocated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proj.engineerBreakdown.map((e) => (
                          <tr key={e.userId} style={{ borderBottom:"1px solid var(--border-faint)" }}>
                            <td style={{ padding:"7px 8px" }}>{e.userName??"Unknown"}</td>
                            <td style={{ padding:"7px 8px", textAlign:"right", fontFamily:"var(--mono)" }}>{e.hoursToDate}h</td>
                            <td style={{ padding:"7px 8px", textAlign:"right", fontFamily:"var(--mono)" }}>{e.totalAllocated}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {proj.description && (
                  <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:16 }}>{proj.description}</div>
                )}
              </>
            )}

            {/* ── Tasks tab ── */}
            {activeTab === "tasks" && (
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:13, color:"var(--text-muted)" }}>
                    {tasks.length} task{tasks.length!==1?"s":""} · {tasks.filter(t=>t.status==="DONE").length} done
                  </div>
                  {canEdit && (
                    <button className="btn primary sm" onClick={() => openCreateTask()}>+ Add task</button>
                  )}
                </div>

                {tasksLoading ? (
                  <div style={{ color:"var(--text-muted)", fontSize:13 }}>Loading tasks…</div>
                ) : tasks.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"var(--text-muted)", fontSize:13 }}>
                    No tasks yet.{canEdit && <> <button className="btn sm" style={{ marginLeft:8 }} onClick={() => openCreateTask()}>Add first task</button></>}
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {tasks.map((t) => (
                      <div key={t.id}>
                        <TaskRow
                          task={t} canEdit={canEdit}
                          onEdit={() => openEditTask(t)}
                          onDelete={() => handleDeleteTask(t.id)}
                          onStatusChange={(s) => patchTaskStatus(t.id, s)}
                          onAddSubtask={() => openCreateTask(t.id)}
                        />
                        {t.subtasks.map((s) => (
                          <TaskRow
                            key={s.id} task={s} canEdit={canEdit} isSubtask
                            onEdit={() => openEditTask(s)}
                            onDelete={() => handleDeleteTask(s.id)}
                            onStatusChange={(st) => patchTaskStatus(s.id, st)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)" }}>
            Select a project to view details
          </div>
        )}
      </div>

      {/* ── Task modal ── */}
      {showTaskModal && (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal" style={{ maxWidth:520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editTask ? "Edit task" : "New task"}</h2>
              <button className="iconbtn" onClick={() => setShowTaskModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveTask} className="modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Task name *</span>
                  <input value={taskForm.name} onChange={(e) => setTaskForm(s=>({...s,name:e.target.value}))} required autoFocus />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={taskForm.status} onChange={(e) => setTaskForm(s=>({...s,status:e.target.value}))}>
                    {TASK_STATUSES.map(st => <option key={st} value={st}>{TASK_STATUS_META[st].label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Priority</span>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm(s=>({...s,priority:e.target.value}))}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Assigned to</span>
                  <select value={taskForm.assignedUserId} onChange={(e) => setTaskForm(s=>({...s,assignedUserId:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Due date</span>
                  <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm(s=>({...s,dueDate:e.target.value}))} />
                </label>
                <label className="field">
                  <span>Estimated hours</span>
                  <input type="number" min={0} step={0.5} value={taskForm.estimatedHours}
                    onChange={(e) => setTaskForm(s=>({...s,estimatedHours:Number(e.target.value)}))} />
                </label>
                {!taskForm.parentId && (
                  <label className="field">
                    <span>Parent task (subtask of)</span>
                    <select value={taskForm.parentId} onChange={(e) => setTaskForm(s=>({...s,parentId:e.target.value}))}>
                      <option value="">None (top-level)</option>
                      {tasks.filter(t => t.id !== editTask?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Description</span>
                  <textarea value={taskForm.description} rows={2} style={{ resize:"vertical" }}
                    onChange={(e) => setTaskForm(s=>({...s,description:e.target.value}))} />
                </label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn" onClick={() => setShowTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={taskSaving}>{taskSaving?"Saving…":"Save task"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit project modal ── */}
      {showEditModal && selected && (
        <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="modal-head">
              <h2>Edit {selected.name}</h2>
              <button className="iconbtn" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEdit} className="modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Project name</span>
                  <input value={editForm.name} onChange={(e) => setEditForm(s=>({...s,name:e.target.value}))} required />
                </label>
                <label className="field">
                  <span>Client</span>
                  <input value={editForm.clientName} onChange={(e) => setEditForm(s=>({...s,clientName:e.target.value}))} />
                </label>
                <label className="field">
                  <span>Sanctioned hours</span>
                  <input type="number" min={0} value={editForm.sanctionedHours} onChange={(e) => setEditForm(s=>({...s,sanctionedHours:Number(e.target.value)}))} />
                </label>
                <label className="field">
                  <span>$ / hour</span>
                  <input type="number" min={0} step="0.01" placeholder="e.g. 35" value={editForm.hourlyRate} onChange={(e) => setEditForm(s=>({...s,hourlyRate:Number(e.target.value)}))} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={editForm.status} onChange={(e) => setEditForm(s=>({...s,status:e.target.value}))}>
                    <option value="ACTIVE">Active</option><option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label className="field">
                  <span>Division</span>
                  <select value={editForm.divisionId} onChange={(e) => setEditForm(s=>({...s,divisionId:e.target.value}))}>
                    <option value="">No division</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Project manager</span>
                  <select value={editForm.managerId} onChange={(e) => setEditForm(s=>({...s,managerId:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {pmCandidates.map((m) => <option key={m.id} value={m.id}>{m.name ?? "Unnamed"}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={editForm.startDate} onChange={(e) => setEditForm(s=>({...s,startDate:e.target.value}))} />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={editForm.endDate} min={editForm.startDate} onChange={(e) => setEditForm(s=>({...s,endDate:e.target.value}))} />
                </label>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Description</span>
                  <input value={editForm.description} onChange={(e) => setEditForm(s=>({...s,description:e.target.value}))} />
                </label>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Color</span>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditForm(s=>({...s,color:c}))}
                        style={{ width:24, height:24, borderRadius:"50%", background:c, border:editForm.color===c?"3px solid var(--text)":"2px solid transparent", cursor:"pointer" }} />
                    ))}
                  </div>
                </label>
              </div>
              <div className="modal-foot" style={{ marginTop:16 }}>
                <button type="button" className="btn" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={editSaving}>{editSaving?"Saving…":"Save changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create project modal ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="modal-head">
              <h2>New Project</h2>
              <button className="iconbtn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Project name</span>
                  <input value={form.name} onChange={(e) => setForm(s=>({...s,name:e.target.value}))} required />
                </label>
                <label className="field">
                  <span>Code</span>
                  <input value={form.code} onChange={(e) => setForm(s=>({...s,code:e.target.value.toUpperCase()}))} required maxLength={20} />
                </label>
                <label className="field">
                  <span>Client</span>
                  <input value={form.clientName} onChange={(e) => setForm(s=>({...s,clientName:e.target.value}))} />
                </label>
                <label className="field">
                  <span>Sanctioned hours</span>
                  <input type="number" min={0} value={form.sanctionedHours} onChange={(e) => setForm(s=>({...s,sanctionedHours:Number(e.target.value)}))} />
                </label>
                <label className="field">
                  <span>$ / hour</span>
                  <input type="number" min={0} step="0.01" placeholder="e.g. 35" value={form.hourlyRate} onChange={(e) => setForm(s=>({...s,hourlyRate:Number(e.target.value)}))} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={form.status} onChange={(e) => setForm(s=>({...s,status:e.target.value}))}>
                    <option value="ACTIVE">Active</option><option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label className="field">
                  <span>Division</span>
                  <select value={form.divisionId} onChange={(e) => setForm(s=>({...s,divisionId:e.target.value}))}>
                    <option value="">No division</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Project manager</span>
                  <select value={form.managerId} onChange={(e) => setForm(s=>({...s,managerId:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {pmCandidates.map((m) => <option key={m.id} value={m.id}>{m.name ?? "Unnamed"}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Start date</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm(s=>({...s,startDate:e.target.value}))} />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input type="date" value={form.endDate} onChange={(e) => setForm(s=>({...s,endDate:e.target.value}))} />
                </label>
                <label className="field" style={{ gridColumn:"1 / -1" }}>
                  <span>Color</span>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setForm(s=>({...s,color:c}))}
                        style={{ width:24, height:24, borderRadius:"50%", background:c, border:form.color===c?"3px solid var(--text)":"2px solid transparent", cursor:"pointer" }} />
                    ))}
                  </div>
                </label>
              </div>
              <div className="modal-foot" style={{ marginTop:16 }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving?"Creating…":"Create project"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TaskRow sub-component ──────────────────────────────────────────────────────

function TaskRow({
  task, canEdit, isSubtask = false,
  onEdit, onDelete, onStatusChange, onAddSubtask,
}: {
  task: Task | Subtask; canEdit: boolean; isSubtask?: boolean;
  onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: string) => void; onAddSubtask?: () => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const meta = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.TODO;
  const pri  = PRIORITY_META[task.priority]  ?? PRIORITY_META.MEDIUM;
  const overBudget = task.estimatedHours > 0 && task.actualHours > task.estimatedHours;

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10,
      padding: isSubtask ? "7px 10px 7px 28px" : "10px",
      borderRadius:6, border:"1px solid var(--border-faint)",
      background: isSubtask ? "var(--bg-subtle, #fafafa)" : "var(--bg)",
      fontSize:13, marginTop: isSubtask ? 4 : 0,
    }}>
      {/* Status chip — clickable for inline change */}
      {canEdit ? (
        <div style={{ position:"relative" }}>
          <span className={meta.chip} style={{ fontSize:11, cursor:"pointer", userSelect:"none" }}
            onClick={() => setShowStatusMenu(v=>!v)}>
            {meta.label} ▾
          </span>
          {showStatusMenu && (
            <div style={{
              position:"absolute", top:"100%", left:0, zIndex:50,
              background:"var(--bg)", border:"1px solid var(--border)",
              borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,.1)", minWidth:130,
            }}
              onMouseLeave={() => setShowStatusMenu(false)}>
              {TASK_STATUSES.map(s => (
                <div key={s} style={{
                  padding:"8px 12px", cursor:"pointer", fontSize:12,
                  fontWeight: s===task.status ? 600 : 400,
                  background: s===task.status ? "var(--accent-soft)" : "transparent",
                }}
                  onClick={() => { onStatusChange(s); setShowStatusMenu(false); }}>
                  {TASK_STATUS_META[s].label}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className={meta.chip} style={{ fontSize:11 }}>{meta.label}</span>
      )}

      {/* Priority dot */}
      <span title={pri.label} style={{ width:8, height:8, borderRadius:"50%", background:pri.color, flexShrink:0 }} />

      {/* Name */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          textDecoration: task.status==="DONE" ? "line-through" : "none",
          color: task.status==="DONE" ? "var(--text-muted)" : "inherit",
        }}>
          {task.jiraKey && <span style={{ fontSize:11, color:"var(--text-muted)", marginRight:6 }}>{task.jiraKey}</span>}
          {task.name}
        </div>
        <div style={{ fontSize:11, color:"var(--text-muted)", display:"flex", gap:10, marginTop:2 }}>
          {task.assignedUser && <span>👤 {task.assignedUser.name}</span>}
          {task.dueDate && <span>📅 {new Date(task.dueDate).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
          {task.estimatedHours > 0 && (
            <span style={{ color: overBudget ? "var(--bad)" : "inherit" }}>
              {task.actualHours}h / {task.estimatedHours}h est{overBudget ? " ⚠" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          {onAddSubtask && (
            <button className="iconbtn" title="Add subtask" onClick={onAddSubtask} style={{ fontSize:14 }}>＋</button>
          )}
          <button className="iconbtn" title="Edit" onClick={onEdit} style={{ fontSize:13 }}>✏</button>
          <button className="iconbtn" title="Delete" onClick={onDelete} style={{ fontSize:13, color:"var(--bad)" }}>✕</button>
        </div>
      )}
    </div>
  );
}

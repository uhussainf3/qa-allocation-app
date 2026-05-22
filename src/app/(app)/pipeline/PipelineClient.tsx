"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/types/enums";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PipelineItem = {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  probability: number;
  dealSize: number | null;
  expectedStartDate: string | null;
  expectedEndDate: string | null;
  requiredHeadcount: number;
  hoursPerWeek: number;
  skillsRequired: string | null;
  notes: string | null;
  convertedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Suggestion = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  capacity: number;
  allocatedHPW: number;
  availableHPW: number;
  currentUtilPct: number;
  afterUtilPct: number;
  canFit: boolean;
  partialFit: boolean;
};

type SuggestResult = {
  rangeStart: string;
  rangeEnd: string;
  requiredHPW: number;
  requiredHeadcount: number;
  suggestions: Suggestion[];
};

type FormState = {
  name: string;
  clientName: string;
  status: string;
  probability: number;
  dealSize: string;
  expectedStartDate: string;
  expectedEndDate: string;
  requiredHeadcount: number;
  hoursPerWeek: number;
  skillsRequired: string;
  notes: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

const STATUS_META: Record<string, { label: string; chip: string; border: string }> = {
  LEAD:        { label: "Lead",        chip: "chip",          border: "var(--border)" },
  QUALIFIED:   { label: "Qualified",   chip: "chip chip-ok",  border: "var(--ok)" },
  PROPOSAL:    { label: "Proposal",    chip: "chip chip-warn", border: "var(--warn)" },
  NEGOTIATION: { label: "Negotiation", chip: "chip chip-warn", border: "var(--warn)" },
  WON:         { label: "Won",         chip: "chip chip-ok",  border: "var(--ok)" },
  LOST:        { label: "Lost",        chip: "chip chip-bad", border: "var(--bad)" },
};

const BLANK_FORM: FormState = {
  name: "", clientName: "", status: "LEAD", probability: 50,
  dealSize: "", expectedStartDate: "", expectedEndDate: "",
  requiredHeadcount: 1, hoursPerWeek: 40, skillsRequired: "", notes: "",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCurrency(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props { initialItems: PipelineItem[]; currentUserRole: Role; }

export function PipelineClient({ initialItems, currentUserRole }: Props) {
  const router  = useRouter();
  const canEdit = currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  const [items,       setItems]       = useState<PipelineItem[]>(initialItems);
  const [selected,    setSelected]    = useState<PipelineItem | null>(null);
  const [filterStatus, setFilter]     = useState<string>("ALL");
  const [showModal,   setShowModal]   = useState(false);
  const [editItem,    setEditItem]    = useState<PipelineItem | null>(null);
  const [form,        setForm]        = useState<FormState>(BLANK_FORM);
  const [saving,      setSaving]      = useState(false);
  const [converting,  setConverting]  = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestResult | null>(null);
  const [sugLoading,  setSugLoading]  = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active  = items.filter((i) => !["WON","LOST"].includes(i.status));
    const won     = items.filter((i) => i.status === "WON");
    const pipeline = active.reduce((s, i) => s + (i.dealSize ?? 0) * (i.probability / 100), 0);
    const avgProb  = active.length ? Math.round(active.reduce((s, i) => s + i.probability, 0) / active.length) : 0;
    return { total: items.length, active: active.length, won: won.length, pipeline, avgProb };
  }, [items]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => filterStatus === "ALL" ? items : items.filter((i) => i.status === filterStatus),
    [items, filterStatus]
  );

  // ── Load suggestions when selected item changes ────────────────────────────
  useEffect(() => {
    if (!selected) { setSuggestions(null); return; }
    setSugLoading(true);
    setSuggestions(null);
    fetch(`/api/pipeline/${selected.id}/suggest`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d))
      .catch(() => setSuggestions(null))
      .finally(() => setSugLoading(false));
  }, [selected?.id]);

  // ── Refresh list from server ───────────────────────────────────────────────
  async function reloadItems() {
    const r = await fetch("/api/pipeline");
    if (r.ok) {
      const data = await r.json();
      setItems(data);
      if (selected) {
        const updated = data.find((i: PipelineItem) => i.id === selected.id);
        setSelected(updated ?? null);
      }
    }
  }

  // ── Open create / edit modal ───────────────────────────────────────────────
  function openCreate() {
    setEditItem(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  }

  function openEdit(item: PipelineItem) {
    setEditItem(item);
    setForm({
      name:              item.name,
      clientName:        item.clientName ?? "",
      status:            item.status,
      probability:       item.probability,
      dealSize:          item.dealSize != null ? String(item.dealSize) : "",
      expectedStartDate: item.expectedStartDate?.slice(0, 10) ?? "",
      expectedEndDate:   item.expectedEndDate?.slice(0, 10)   ?? "",
      requiredHeadcount: item.requiredHeadcount,
      hoursPerWeek:      item.hoursPerWeek,
      skillsRequired:    item.skillsRequired ?? "",
      notes:             item.notes          ?? "",
    });
    setShowModal(true);
  }

  // ── Save (create or update) ────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        dealSize:          form.dealSize          ? Number(form.dealSize) : null,
        expectedStartDate: form.expectedStartDate || null,
        expectedEndDate:   form.expectedEndDate   || null,
        skillsRequired:    form.skillsRequired    || null,
        notes:             form.notes             || null,
        clientName:        form.clientName        || null,
      };
      const url    = editItem ? `/api/pipeline/${editItem.id}` : "/api/pipeline";
      const method = editItem ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowModal(false);
        await reloadItems();
      }
    } finally { setSaving(false); }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this pipeline deal?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
      if (selected?.id === id) setSelected(null);
      await reloadItems();
    } finally { setDeletingId(null); }
  }

  // ── Convert to project ────────────────────────────────────────────────────
  async function handleConvert() {
    if (!selected) return;
    if (!confirm(`Convert "${selected.name}" to a live project? This cannot be undone.`)) return;
    setConverting(true);
    try {
      const res  = await fetch(`/api/pipeline/${selected.id}/convert`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await reloadItems();
        router.refresh();
        alert(`Project "${data.project.name}" (${data.project.code}) created successfully.`);
      } else {
        alert(data.error ?? "Conversion failed");
      }
    } finally { setConverting(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page" data-screen-label="Pipeline">

      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Sales Pipeline</h1>
          <div className="page-sub">{kpis.active} active deal{kpis.active !== 1 ? "s" : ""}</div>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn primary" onClick={openCreate}>+ New deal</button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-label">Total deals</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-meta">{kpis.active} active</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Weighted pipeline</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{fmtCurrency(kpis.pipeline)}</div>
          <div className="kpi-meta">Probability-adjusted value</div>
        </div>
        <div className={`kpi ${kpis.won > 0 ? "ok" : ""}`}>
          <div className="kpi-label">Won</div>
          <div className="kpi-value">{kpis.won}</div>
          <div className="kpi-meta">Converted to projects</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg probability</div>
          <div className="kpi-value">{kpis.avgProb}<span className="unit">%</span></div>
          <div className="kpi-meta">Active deals</div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="row" style={{ gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {["ALL", ...STATUSES].map((s) => {
          const count  = s === "ALL" ? items.length : items.filter((i) => i.status === s).length;
          const active = filterStatus === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "8px 16px", border: "none",
              background:   active ? "var(--accent-soft)" : "transparent",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: 500,
              color: active ? "var(--accent)" : "var(--text-secondary)",
            }}>
              {s === "ALL" ? "All" : STATUS_META[s].label}
              <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Main layout: list + detail panel */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: 16, alignItems: "start" }}>

        {/* Deal list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              No deals in this stage
            </div>
          ) : filtered.map((item) => (
            <div
              key={item.id}
              className="card"
              onClick={() => setSelected(selected?.id === item.id ? null : item)}
              style={{
                cursor: "pointer",
                borderLeft: `4px solid ${STATUS_META[item.status]?.border ?? "var(--border)"}`,
                background: selected?.id === item.id ? "var(--accent-soft)" : undefined,
                transition: "background 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.name}</div>
                  {item.clientName && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{item.clientName}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
                    <span>{fmtDate(item.expectedStartDate)} → {fmtDate(item.expectedEndDate)}</span>
                    <span>·</span>
                    <span>{item.requiredHeadcount} engineer{item.requiredHeadcount !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{item.hoursPerWeek}h/wk</span>
                    {item.dealSize && <><span>·</span><span>{fmtCurrency(item.dealSize)}</span></>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <span className={STATUS_META[item.status]?.chip ?? "chip"} style={{ fontSize: 10 }}>
                    {STATUS_META[item.status]?.label ?? item.status}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>
                    {item.probability}%
                  </span>
                  {item.convertedProjectId && (
                    <span className="chip chip-ok" style={{ fontSize: 10 }}>Converted</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position: "sticky", top: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {canEdit && !selected.convertedProjectId && (
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => openEdit(selected)}>Edit</button>
                )}
                {canEdit && !selected.convertedProjectId && (
                  <button
                    className="btn"
                    style={{ fontSize: 12, color: "var(--bad)" }}
                    onClick={() => handleDelete(selected.id)}
                    disabled={deletingId === selected.id}
                  >
                    {deletingId === selected.id ? "…" : "Delete"}
                  </button>
                )}
                <button className="iconbtn" onClick={() => setSelected(null)} title="Close">✕</button>
              </div>
            </div>

            {/* Deal details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13, marginBottom: 16 }}>
              {[
                ["Client",      selected.clientName ?? "—"],
                ["Status",      STATUS_META[selected.status]?.label ?? selected.status],
                ["Probability", `${selected.probability}%`],
                ["Deal size",   fmtCurrency(selected.dealSize)],
                ["Start",       fmtDate(selected.expectedStartDate)],
                ["End",         fmtDate(selected.expectedEndDate)],
                ["Headcount",   `${selected.requiredHeadcount} engineer${selected.requiredHeadcount !== 1 ? "s" : ""}`],
                ["Hours/week",  `${selected.hoursPerWeek}h`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            {selected.skillsRequired && (
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Skills required</div>
                <div>{selected.skillsRequired}</div>
              </div>
            )}
            {selected.notes && (
              <div style={{ fontSize: 13, marginBottom: 16, color: "var(--text-secondary)" }}>{selected.notes}</div>
            )}

            {/* Convert to project button */}
            {canEdit && !selected.convertedProjectId && (
              <button
                className="btn primary"
                style={{ width: "100%", marginBottom: 20 }}
                onClick={handleConvert}
                disabled={converting}
              >
                {converting ? "Converting…" : "⚡ Convert to Project"}
              </button>
            )}
            {selected.convertedProjectId && (
              <div className="chip chip-ok" style={{ marginBottom: 20, display: "inline-block" }}>
                ✓ Converted to project
              </div>
            )}

            {/* Resource suggestions */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Resource suggestions</div>
              {sugLoading ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Calculating availability…</div>
              ) : !suggestions ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data available</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
                    Needs {suggestions.requiredHeadcount} × {suggestions.requiredHPW}h/wk ·{" "}
                    {suggestions.rangeStart} → {suggestions.rangeEnd}
                  </div>
                  {suggestions.suggestions.filter((s) => s.canFit || s.partialFit).slice(0, 8).map((s) => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 0", borderBottom: "1px solid var(--border-faint)",
                      fontSize: 13,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name ?? s.email}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {s.availableHPW}h/wk free · {s.currentUtilPct}% → {s.afterUtilPct}% utilisation
                        </div>
                      </div>
                      <span className={`chip chip-${s.canFit ? "ok" : "warn"}`} style={{ fontSize: 10, flexShrink: 0 }}>
                        {s.canFit ? "Fits" : "Partial"}
                      </span>
                    </div>
                  ))}
                  {suggestions.suggestions.filter((s) => s.canFit || s.partialFit).length === 0 && (
                    <div style={{ color: "var(--bad)", fontSize: 13 }}>
                      No engineers with sufficient capacity in this period.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editItem ? "Edit deal" : "New deal"}</h2>
              <button className="iconbtn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Deal name *</span>
                  <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required autoFocus />
                </label>
                <label className="field">
                  <span>Client</span>
                  <input value={form.clientName} onChange={(e) => setForm((s) => ({ ...s, clientName: e.target.value }))} placeholder="Client name…" />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Probability (%)</span>
                  <input type="number" min={0} max={100} value={form.probability}
                    onChange={(e) => setForm((s) => ({ ...s, probability: Number(e.target.value) }))} />
                </label>
                <label className="field">
                  <span>Deal size ($)</span>
                  <input type="number" min={0} value={form.dealSize} placeholder="e.g. 50000"
                    onChange={(e) => setForm((s) => ({ ...s, dealSize: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Expected start</span>
                  <input type="date" value={form.expectedStartDate}
                    onChange={(e) => setForm((s) => ({ ...s, expectedStartDate: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Expected end</span>
                  <input type="date" value={form.expectedEndDate} min={form.expectedStartDate}
                    onChange={(e) => setForm((s) => ({ ...s, expectedEndDate: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Headcount needed</span>
                  <input type="number" min={1} value={form.requiredHeadcount}
                    onChange={(e) => setForm((s) => ({ ...s, requiredHeadcount: Number(e.target.value) }))} />
                </label>
                <label className="field">
                  <span>Hours / week</span>
                  <input type="number" min={1} max={80} value={form.hoursPerWeek}
                    onChange={(e) => setForm((s) => ({ ...s, hoursPerWeek: Number(e.target.value) }))} />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Skills required</span>
                  <input value={form.skillsRequired} placeholder="e.g. Selenium, JIRA, Python…"
                    onChange={(e) => setForm((s) => ({ ...s, skillsRequired: e.target.value }))} />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Notes</span>
                  <textarea value={form.notes} rows={3} style={{ resize: "vertical" }}
                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
                </label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

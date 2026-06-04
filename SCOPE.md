# Project Scope & Feature Tracker

This file is the single source of truth for what has been built and what is pending.
Claude reads this at the start of every session and updates it as features are completed.

**Status legend:**
- ✅ Done — built, committed, deployed
- 🔄 In Progress — currently being worked on
- 📋 To Do — not started yet
- ⏸ Blocked — waiting on something

---

## Phase 1 — Core Allocation App (Complete)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Allocations grid (weekly view) | ✅ Done | Per-user, per-week heat cells |
| 2 | Manage Allocations list | ✅ Done | CRUD with date/project/user filters |
| 3 | Capacity heatmap (12-week) | ✅ Done | Per-engineer utilisation with holiday awareness |
| 4 | Forecast page (30/60/90 day) | ✅ Done | Demand vs capacity with KPI tiles |
| 5 | Bench page | ✅ Done | Today's available resources, partially/fully free |
| 6 | Projects page | ✅ Done | Hours allocated vs consumed, per-engineer breakdown |
| 7 | Conflicts page | ✅ Done | Over-allocated engineers |
| 8 | Leave management | ✅ Done | Apply/approve/reject, affects capacity |
| 9 | Public holidays | ✅ Done | Excluded from working day calculations |
| 10 | Hours logging | ✅ Done | Log actual hours against projects |
| 11 | Pipeline page | ✅ Done | Opportunity tracking with probability/deal size |
| 12 | Authentication (Auth.js v5) | ✅ Done | Role-based, PrismaAdapter, Neon DB |

---

## Phase 2 — Folio3 Multi-Division Expansion (Complete)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Division schema + DB | ✅ Done | Division model, owner, members[], projects[] relations |
| 2 | Role system overhaul | ✅ Done | ADMIN \| EXECUTIVE \| DIVISION_OWNER \| PROJECT_MANAGER \| MEMBER |
| 3 | JobTitle field | ✅ Done | DEVELOPER \| QA_ENGINEER \| FUNCTIONAL_CONSULTANT \| SUPPORT_ENGINEER \| PROJECT_MANAGER \| PRODUCT_MANAGER |
| 4 | `/api/divisions` CRUD | ✅ Done | GET all, POST create, PATCH update, DELETE (blocks if has members/projects) |
| 5 | `/api/users` CRUD | ✅ Done | GET with filters, POST create, PATCH update, DELETE (soft-delete → isActive=false) |
| 6 | Divisions management page | ✅ Done | ADMIN only — create/edit/delete divisions, assign owners, color picker |
| 7 | Team management page | ✅ Done | ADMIN only — full roster, add/edit/deactivate members, division/role filters |
| 8 | Executive Dashboard | ✅ Done | Company KPIs, per-division utilisation bars, ending-soon allocations, pipeline |
| 9 | Division filter — Allocations grid | ✅ Done | Client-side dropdown, filters visible engineers |
| 10 | Division filter — Manage Allocations | ✅ Done | Client-side dropdown |
| 11 | Division filter — Capacity heatmap | ✅ Done | URL searchParam, server-side filter |
| 12 | Division filter — Forecast | ✅ Done | URL searchParam, server-side filter |
| 13 | Division filter — Bench | ✅ Done | Client-side dropdown |
| 14 | Division filter — Projects | ✅ Done | Client-side dropdown |
| 15 | Sidebar rebrand (Folio3 Allocation) | ✅ Done | New nav groups, role labels updated |
| 16 | Production bug fix — date serialization | ✅ Done | unstable_cache Date→string inside cache fn; /team and /divisions were 500ing |

---

## Phase 3 — Pending Features

> Add new requirements here. Claude will pick up from here after a /clear.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Job Title management UI | ✅ Done | Settings page — add/edit/delete; TeamClient dropdown driven from DB |

---

## How to use this file

- **Adding new requirements:** Tell Claude what you want built. Claude will add it to Phase 3 as 📋 To Do before starting.
- **After `/clear`:** Claude reads this file automatically. Just say "continue from SCOPE.md" and it will know where to pick up.
- **Mid-feature:** Claude marks the row 🔄 In Progress at the start, ✅ Done when committed.
- **Blocked items:** Claude notes the blocker in the Notes column and marks ⏸ Blocked.

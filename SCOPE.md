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
| 2 | RM Tool Data Migration — Schema | ✅ Done | externalId on User+Project; AllocationBatch model; batchId on Allocation; db push to dev |
| 3 | RM Tool Data Migration — API routes | ✅ Done | POST /api/import/divisions, /projects, /employees, /allocations (dry-run support); GET /api/import/allocations/batches |
| 4 | RM Tool Data Migration — Import UI | ✅ Done | RM Tool Migration tab: upload 3 CSVs, client-side parse, 4-stage progress wizard; file inputs use hidden input + button ref pattern |
| 5 | Weekly Batch Upload UI | ✅ Done | Weekly Upload tab (ADMIN+DO): dry-run preview → confirm import; batch selector on Allocations page; old batches read-only with banner |
| 6 | Employee import — jobTitle + department | ✅ Done | Position column → jobTitle (stored as-is e.g. "Senior QA Engineer"); RM Role column → department ("Developer"/"QA Engineer"/"Project Manager"/"Functional Consultant"); backfills on re-import |
| 7 | Allocations grid — Role filter | ✅ Done | Role dropdown (from User.department) alongside Division filter; both filters combine |
| 8 | Allocations grid — hours rounding | ✅ Done | All hours display rounded to whole numbers (r1 helper); underlying stored values unchanged |
| 9 | Bench page — three views | ✅ Done | Detailed (unchanged) / Simple (name + bench% only) / +30 days (who frees up in 30 days); segmented control switcher |
| 10 | Bench page — Sum of bench % KPI tile | ✅ Done | New tile showing sum of onBenchPct across visible bench resources |
| 11 | Manage Allocations — Role filter | ✅ Done | Role dropdown filters allocations by User.department; chains with division filter |
| 12 | Allocations grid — engineer count respects filters | ✅ Done | "X engineers" subtitle and KPI tile now use visibleUsers.length (not raw users.length) |
| 13 | Weekly Upload — preview bug fixes | ✅ Done | Fixed 0/0/0 counts (response format mismatch); added loading state; CSV-only validation (client+server); file clear button; DIVISION_OWNER access; robust JSON error handling |
| 14 | Weekly Upload — enriched error display | ✅ Done | How-to-fix callout groups missing employees/projects by ID; error table shows row data (employeeId, projectId, dates) |
| 15 | Weekly Upload — auto-create missing employees/projects | ✅ Done | Parses Emp Name, Project Name, Director ID from CSV; auto-creates missing User/Project records with real names; derives division from Director ID |
| 16 | Weekly Upload — import logs | ✅ Done | AllocationBatch.log Json? stores full import summary per batch; log save wrapped in try/catch so import never fails if logging errors |
| 17 | Import History tab | ✅ Done | New tab (ADMIN+DO) listing all past batches; expandable per-batch log: summary grid + auto-created employees/projects + skipped rows |
| 18 | Bench — Role + PM filters | ✅ Done | Role dropdown (User.department); PM dropdown (PROJECT_MANAGER users); PM filter narrows to resources in PM's division |
| 19 | Bench — UI improvements | ✅ Done | Simple and +30 views use compact flex rows (maxWidth 680px) — name and bench% no longer at extreme corners |
| 20 | Bench — Export to CSV | ✅ Done | "↓ CSV" button downloads current filtered view (all 3 views supported); includes projects column for detailed view |
| 21 | Allocations grid — PM filter | ✅ Done | "All managers" dropdown; selecting PM filters grid to resources in that PM's division |
| 22 | Manage Allocations — PM filter | ✅ Done | Same PM filter; chains division → PM → role → resource/project |
| 23 | isOnshore flag on User | ✅ Done | Schema: isOnshore Boolean @default(false); Team page edit modal checkbox with description; bench page excludes onshore users entirely; API PATCH supports field |
| 24 | PM filter — managerId relationship | ✅ Done | Schema: User.managerId FK to self; weekly import populates managerId from Director ID column (most-frequent director per employee); employees import sets managerId from dominantDirectorId; all 3 PM filters now use managerId directly instead of division-based lookup |
| 25 | Prisma client regeneration note | ✅ Done | After schema changes (log, isOnshore, managerId), must stop dev server → npx prisma generate → restart to avoid PrismaClientValidationError on new fields |
| 26 | Import algorithm — Full Replace scoped to csvPairs | ✅ Done | Delete batch allocs for (userId,projectId) pairs in CSV + date range, then insert fresh; 13-scenario coverage |
| 27 | importUtils.ts — pure import utility functions | ✅ Done | parseRMDate, computeCsvRange, buildCsvPairKey, detectIntraCSVOverlaps, detectDuplicateRows, buildPercentChangeNote, buildOverlapNote |
| 28 | Stale Allocations screen | ✅ Done | Two-section UI: Section A (within CSV range) + Section B (beyond CSV maxEnd); DELETE per row; ADMIN+DO only |
| 29 | Overlap Alerts screen | ✅ Done | Tab in Import page showing current-batch allocations flagged with overlap notes (S-6) |
| 30 | Import History — enriched skipped rows | ✅ Done | S-7/S-8/S-12 skipped rows stored in batch log with reason, employeeId, projectId, dates |
| 31 | Unit tests — importUtils.ts | ✅ Done | 51 tests in src/lib/__tests__/importUtils.test.ts; vitest.config.mts with @/ alias; covers all 7 utility functions mapped to S-1 through S-13 |
| 32 | Upload progress bar — real numbers | 📋 To Do | Weekly Upload + RM Migration: show step X of Y, live created/skipped counts per phase, % fill based on completed steps |
| 33 | Allocation creation date | 📋 To Do | Surface createdAt field in Manage Allocations list as a sortable "Created" column and read-only field in the edit modal |
| 34 | Projects — search bar + PM filter | ✅ Done | Search input filters by name/code; "All managers" dropdown filters by managerId; both combine with division filter on Projects page |
| 35 | Project hourly rate ($/hr) + billed amounts | ✅ Done | Schema: Project.hourlyRate Float?; $/hour input in New/Edit Project modals; Executive Dashboard "Top 10 Projects by Hours-to-Date" panel shows Contracted Value (sanctioned×rate), Allocated Value (allocated×rate), Billed to Date (hoursToDate×rate) |
| 36 | Bench — role tiles + +60 days view | ✅ Done | Role tiles (count per dept) on all 4 views; Total KPI tile on +30/+60 snapshot views; +60 days 4th tab; roleOptions from allUsers; benchUtils.ts extracted; benchUtils.test.ts (22 tests) |
| 37 | Forecast — role/department filter + decimal rounding | ✅ Done | RoleFilter URL param component (RoleFilter.tsx); filters ALL page data by User.department; demand rounded to whole number; subtitle shows active role |
| 38 | Leave multi-level approval workflow | ✅ Done | PM L1 → DO L2; clientApproval + backupPlan fields; leave hours deducted from project totals; leaveUtils.ts extracted; leaveUtils.test.ts (27 tests) |
| 39 | Integration test — GET /api/leave response contract | ✅ Done | leaveApi.integration.test.ts (16 tests); mocks Prisma+auth; asserts flat approverName shape, projectNames, date serialization, 401 guard |
| 40 | Bench role tiles — sum of bench % | ✅ Done | Each role tile now shows resource count + sum of onBenchPct for that role; buildRoleTiles updated; benchUtils.test.ts now 26 tests |

---

## How to use this file

- **Adding new requirements:** Tell Claude what you want built. Claude will add it to Phase 3 as 📋 To Do before starting.
- **After `/clear`:** Claude reads this file automatically. Just say "continue from SCOPE.md" and it will know where to pick up.
- **Mid-feature:** Claude marks the row 🔄 In Progress at the start, ✅ Done when committed.
- **Blocked items:** Claude notes the blocker in the Notes column and marks ⏸ Blocked.

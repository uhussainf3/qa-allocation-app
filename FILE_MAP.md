# File Map — Quick Reference

Use this to identify exactly which file to target before asking Claude to make a change.
Every file listed here is in `src/`. Paths are relative to `src/`.

---

## Pages (Server Components)
These fetch data from DB and pass it to Client components. No interactivity here.

| File | Route | What it does |
|------|-------|-------------|
| `app/page.tsx` | `/` | Redirects to `/allocations` |
| `app/(app)/layout.tsx` | (all app routes) | Wraps every page with auth check + Sidebar + UpdateBanner ("data last updated") |
| `app/(app)/allocations/page.tsx` | `/allocations` | Fetches users + allocations for 12-week grid; passes to AllocationsClient |
| `app/(app)/allocation-list/page.tsx` | `/allocation-list` | Fetches all allocations list view; passes to AllocationListClient |
| `app/(app)/capacity/page.tsx` | `/capacity` | Fetches 12-week capacity data, filters by division via URL searchParam |
| `app/(app)/forecast/page.tsx` | `/forecast` | Fetches 13-week demand vs capacity; filters by division via URL searchParam |
| `app/(app)/bench/page.tsx` | `/bench` | Fetches today's active allocations; excludes isOnshore users before bench calc; passes to BenchClient |
| `app/(app)/projects/page.tsx` | `/projects` | Fetches projects + all allocations + hours consumed; passes to ProjectsClient; wrapped in `<Suspense>` (ProjectsClient uses `useSearchParams`); builds per-allocation rows (Resource, dates, Allocation %, Hours to Date, Total Hours) and groups them into Active/Upcoming/Ended via `lib/projectAllocationUtils.ts` as `allocationDetails` per project |
| `app/(app)/conflicts/page.tsx` | `/conflicts` | Fetches 4-week allocations and calculates over-allocated engineers (no client component) |
| `app/(app)/dashboard/page.tsx` | `/dashboard` | Executive dashboard — fetches divisions, users (incl. department), today's allocations, projects, leaves, pipeline; computes per-project `departmentHours`/`departmentAllocatedHours`; passes raw users/allocations/activeProjects/leaves arrays to DashboardClient for client-side Division+Role filtering |
| `app/(app)/team/page.tsx` | `/team` | ADMIN only — fetches all users + divisions; passes to TeamClient |
| `app/(app)/divisions/page.tsx` | `/divisions` | ADMIN only — fetches all divisions + active users; passes to DivisionsClient |
| `app/(app)/pipeline/page.tsx` | `/pipeline` | Fetches all pipeline opportunities; passes to PipelineClient |
| `app/(app)/leave/page.tsx` | `/leave` | Fetches leave records (all for managers, own for members); passes to LeaveClient |
| `app/(app)/requests/page.tsx` | `/requests` | Fetches resource requests + projects + users; passes to RequestsClient |
| `app/(app)/hours/page.tsx` | `/hours` | Fetches current week's hours logs for the logged-in user; passes to HoursClient |
| `app/(app)/timesheets/page.tsx` | `/timesheets` | Fetches timesheets (all or own); passes to TimesheetsClient |
| `app/(app)/tasks/page.tsx` | `/tasks` | Renders MyTasksClient (tasks fetched client-side) |
| `app/(app)/skills/page.tsx` | `/skills` | Fetches skill matrix (users × skills × levels); renders inline (no client component) |
| `app/(app)/audit/page.tsx` | `/audit` | Fetches last 200 audit log entries; renders inline table (no client component) |
| `app/(app)/settings/page.tsx` | `/settings` | Fetches public holidays + job titles; passes to HolidaysClient/JobTitlesClient; renders DangerZoneClient for ADMIN |
| `app/(app)/import/page.tsx` | `/import` | ADMIN/PM only gate; renders ImportClient |
| `app/(app)/notifications/page.tsx` | `/notifications` | Fetches last 50 notifications for current user; passes to NotificationsClient |
| `app/(auth)/login/page.tsx` | `/login` | Login page shell |

---

## Client Components
These handle UI state, dropdowns, modals, CRUD calls. Always in a `*Client.tsx` file.

| File | Used by page | What it does |
|------|-------------|-------------|
| `app/(app)/allocations/AllocationsClient.tsx` | `/allocations` | Interactive weekly grid — add/edit/delete allocations, division filter dropdown |
| `app/(app)/allocation-list/AllocationListClient.tsx` | `/allocation-list` | Sortable/filterable allocation list — resource, project, division filters, inline edit |
| `app/(app)/bench/BenchClient.tsx` | `/bench` | Bench table with KPI tiles; division/role/PM filter dropdowns; CSV export; compact simple+30 row layout |
| `app/(app)/projects/ProjectsClient.tsx` | `/projects` | Project cards with status/hours/engineer breakdown, add/edit project modal, division filter; reads `?search=` URL param to pre-fill search box and pre-select a project (deep link from Executive Dashboard); "Allocations" tab shows per-allocation Resource/Start/End/Allocation %/Hours to Date/Total Hours in Active, Upcoming, and collapsible Ended sections |
| `app/(app)/dashboard/DashboardClient.tsx` | `/dashboard` | Company KPIs, per-division utilisation bars, ending-soon table, pipeline summary; project names in "Top 10 Projects" table link to `/projects?search=<code>`; Top Projects table has an "Allocated" column alongside "Hours to Date"; Division + Role filters jointly re-scope all KPI tiles, Division Breakdown cards, and the Ending Soon panel (Pipeline always unfiltered) via `lib/dashboardUtils.ts` |
| `app/(app)/team/TeamClient.tsx` | `/team` | Full team roster — search, filters, add/edit/deactivate member modal |
| `app/(app)/divisions/DivisionsClient.tsx` | `/divisions` | Division CRUD — create/edit/delete divisions, color picker, owner assignment, "Merge into…" action to reassign all members/projects into another division |
| `app/(app)/pipeline/PipelineClient.tsx` | `/pipeline` | Pipeline kanban/table — add/edit/convert opportunities, probability/deal size |
| `app/(app)/leave/LeaveClient.tsx` | `/leave` | Leave request form, approve/reject (managers), leave calendar |
| `app/(app)/requests/RequestsClient.tsx` | `/requests` | Resource request form, status updates, assign engineer |
| `app/(app)/hours/HoursClient.tsx` | `/hours` | Daily hours entry by project, week navigation |
| `app/(app)/timesheets/TimesheetsClient.tsx` | `/timesheets` | Timesheet submit/review/approve flow |
| `app/(app)/tasks/MyTasksClient.tsx` | `/tasks` | My tasks list — fetches tasks client-side, mark complete |
| `app/(app)/settings/HolidaysClient.tsx` | `/settings` | Add/delete public holidays (ADMIN only) |
| `app/(app)/settings/DangerZoneClient.tsx` | `/settings` | ADMIN only — dry-run preview + confirm-gated full data reset (wipes divisions/projects/allocations/users except self) |
| `app/(app)/import/ImportClient.tsx` | `/import` | CSV import wizard; Weekly Upload (auto-create employees/projects, import logs); Import History tab |
| `app/(app)/notifications/NotificationsClient.tsx` | `/notifications` | Notification list, mark as read |
| `app/(auth)/login/LoginButton.tsx` | `/login` | Google sign-in button |

---

## Shared Components

| File | What it does |
|------|-------------|
| `components/layout/Sidebar.tsx` | Left nav sidebar — role-aware nav links, user badge, role label |
| `components/layout/UpdateBanner.tsx` | Top-of-page banner (rendered in `(app)/layout.tsx` above `{children}`) — shows when the current allocation batch (RM Migration / Weekly Upload) was last imported and by whom; warns if stale (>7 days) |
| `components/DivisionFilter.tsx` | Reusable division dropdown — updates URL `?division=` param (used by Capacity + Forecast) |
| `components/providers.tsx` | Wraps app in `SessionProvider` (NextAuth client session context) |

---

## API Routes

### Allocations
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/allocations/route.ts` | `GET/POST /api/allocations` | List allocations in range / create new allocation |
| `app/api/allocations/[id]/route.ts` | `PATCH/DELETE /api/allocations/[id]` | Update or delete a single allocation |
| `app/api/allocations/view/route.ts` | `GET /api/allocations/view` | Read-only allocation view for the grid |

### Projects
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/projects/route.ts` | `GET/POST /api/projects` | List projects / create new project |
| `app/api/projects/[id]/route.ts` | `PATCH/DELETE /api/projects/[id]` | Update or delete a project |

### Users
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/users/route.ts` | `GET/POST /api/users` | List users (with filters: includeInactive, divisionId) / create user |
| `app/api/users/[id]/route.ts` | `PATCH/DELETE /api/users/[id]` | Update user / soft-delete (sets isActive=false) |

### Divisions
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/divisions/route.ts` | `GET/POST /api/divisions` | List all divisions / create new division (ADMIN only) |
| `app/api/divisions/[id]/route.ts` | `PATCH/DELETE /api/divisions/[id]` | Update division / delete (blocked if has members or projects) |
| `app/api/divisions/[id]/merge/route.ts` | `POST /api/divisions/[id]/merge` | ADMIN only — reassigns all Users + Projects from division [id] to `targetId` (body); source division ends with 0 members/projects so it can then be deleted |

### Pipeline
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/pipeline/route.ts` | `GET/POST /api/pipeline` | List / create pipeline opportunities |
| `app/api/pipeline/[id]/route.ts` | `PATCH/DELETE /api/pipeline/[id]` | Update or delete opportunity |
| `app/api/pipeline/[id]/convert/route.ts` | `POST /api/pipeline/[id]/convert` | Convert pipeline opportunity to an active project |
| `app/api/pipeline/[id]/suggest/route.ts` | `POST /api/pipeline/[id]/suggest` | AI-suggest resource allocation for an opportunity |

### Leave & Requests
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/leave/route.ts` | `GET/POST/PATCH /api/leave` | List, create, approve/reject leave requests |
| `app/api/requests/route.ts` | `GET/POST/PATCH /api/requests` | Resource requests CRUD |

### Hours & Timesheets
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/hours/route.ts` | `GET/POST /api/hours` | List / log hours against a project |
| `app/api/hours/[id]/route.ts` | `PATCH/DELETE /api/hours/[id]` | Edit or delete a hours log entry |
| `app/api/timesheets/route.ts` | `GET/POST/PATCH /api/timesheets` | Timesheet submit / review / approve |

### Tasks
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/tasks/route.ts` | `GET/POST /api/tasks` | List / create project tasks |
| `app/api/tasks/[id]/route.ts` | `PATCH/DELETE /api/tasks/[id]` | Update or delete a task |
| `app/api/tasks/my/route.ts` | `GET /api/tasks/my` | Tasks assigned to the current user |

### Other
| File | Endpoint | What it does |
|------|----------|-------------|
| `app/api/holidays/route.ts` | `GET/POST /api/holidays` | List / add public holidays |
| `app/api/holidays/[id]/route.ts` | `DELETE /api/holidays/[id]` | Delete a public holiday |
| `app/api/skills/route.ts` | `GET/POST/PATCH/DELETE /api/skills` | Skills CRUD |
| `app/api/notifications/route.ts` | `GET/PATCH /api/notifications` | List notifications / mark as read |
| `app/api/import/route.ts` | `POST /api/import` | Legacy CSV bulk import for allocations (by email + project code) |
| `app/api/import/divisions/route.ts` | `POST /api/import/divisions` | ADMIN — create division-owner users + divisions from RM director rows |
| `app/api/import/projects/route.ts` | `POST /api/import/projects` | ADMIN — upsert projects by externalId, map status, link to division via director |
| `app/api/import/employees/route.ts` | `POST /api/import/employees` | ADMIN — upsert employees; jobTitle from Position column, department from Role column |
| `app/api/import/allocations/route.ts` | `POST /api/import/allocations` | ADMIN+DO — create AllocationBatch + upsert allocations; auto-creates missing employees/projects; dryRun:true for preview; stores log JSON on batch |
| `app/api/import/allocations/batches/route.ts` | `GET /api/import/allocations/batches` | List all AllocationBatch records newest-first with allocation counts, log, and uploader name |
| `app/api/admin/reset/route.ts` | `GET/POST /api/admin/reset` | ADMIN only — "Danger Zone" full data reset. GET returns dry-run counts + details; POST (body `{ confirm: "DELETE ALL DATA" }`) deletes all Divisions/Projects/Allocations/dependents and all Users except the caller |
| `app/api/keep-alive/route.ts` | `GET /api/keep-alive` | Pings DB to prevent Neon cold start |
| `app/api/auth/[...nextauth]/route.ts` | `/api/auth/*` | NextAuth.js handler (Google OAuth) |
| `app/api/test/session/route.ts` | `/api/test/session` | Dev-only: inspect current session |

---

## Library / Utilities

| File | What it does |
|------|-------------|
| `lib/queries.ts` | All `unstable_cache` DB query functions — the single source for cached data. **All Date fields must be serialised to ISO strings inside the cache function.** |
| `lib/auth.ts` | NextAuth config — Google provider, PrismaAdapter, session callback that injects `user.id` and `user.role` |
| `lib/prisma.ts` | Prisma client singleton (prevents multiple instances in dev hot-reload) |
| `lib/weeks.ts` | Date/week utilities — `getMondayOf`, `getNextNWeeks`, `workingDaysInWeek`, `totalWorkingDays`, `getWeekLabel` |
| `lib/apiResponse.ts` | Tiny helpers — `ok()`, `err()`, `unauthorized()`, `forbidden()`, `notFound()` for consistent API responses |
| `lib/resetUtils.ts` | Pure helpers for the ADMIN "Danger Zone" reset: `buildResetSummary`, `totalRecordsToDelete`, `isResetConfirmed`, `RESET_CONFIRM_PHRASE`, `RESET_LABELS`, `RESET_PRESERVED_LABELS` |
| `lib/divisionMergeUtils.ts` | Pure helpers for the Divisions page "Merge into…" action: `validateMerge`, `buildMergePreview`, `mergeTargetOptions` |
| `lib/batchBannerUtils.ts` | Pure helpers for the top "data last updated" banner: `formatRelativeTime`, `buildBatchBannerInfo`, `STALE_THRESHOLD_MS` |
| `lib/accessUtils.ts` | Shared access-control predicate `canViewExecutiveDashboard(role, jobTitle)` — used by proxy.ts, dashboard page guard, and Sidebar nav |
| `lib/dashboardUtils.ts` | Pure helpers for the Executive Dashboard's Division+Role filters: `filterUsers`, `computeUtilPct`, `computeBenchCount`, `computeActiveProjectCount`, `computeFilteredLeaveCount`, `filterEndingSoon`, `buildDivisionRoleStats` |
| `lib/projectAllocationUtils.ts` | Pure helpers for the Projects page "Allocations" tab: `computeAllocationPct`, `categorizeAllocation`, `groupAllocationsByCategory` (Active/Upcoming/Ended) |
| `proxy.ts` | Next.js middleware (runs on every request) — auth guard, role-based route protection |

---

## Types

| File | What it does |
|------|-------------|
| `types/enums.ts` | All TypeScript union types — `Role`, `JobTitle`, `ProjectStatus`, `LeaveType`, `LeaveStatus`, `TimesheetStatus`, `RequestStatus`, `NotificationType` |
| `types/next-auth.d.ts` | Extends NextAuth `Session` and `User` types to include `id` and `role` |

---

## Config Files (root of project)

| File | What it does |
|------|-------------|
| `prisma/schema.prisma` | Full DB schema — all models, relations, enums. Edit here then run `npx prisma db push` |
| `next.config.ts` | Next.js configuration |
| `.env.local` | Environment variables — `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` |
| `CODEBASE_RULES.md` | Coding rules and gotchas Claude must follow |
| `SCOPE.md` | Feature tracker — what is built and what is pending |
| `FILE_MAP.md` | This file |

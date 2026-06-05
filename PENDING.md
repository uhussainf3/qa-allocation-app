# Pending Discussion — Allocation Import Deduplication

**Date:** 2026-06-05  
**Context:** Weekly CSV upload from RM tool cannot reliably update existing allocations because the RM Data file has no unique allocation ID. The only natural key available is `(employeeId, projectId, startDate)`.

---

## The Core Problem

- `Employee_RM.csv` has `FomsId` → stored as `User.externalId` ✅
- `Projects File.csv` has `ProjectID` → stored as `Project.externalId` ✅
- `RM - Data.csv` has **no allocation ID** — only `Employee ID`, `Project ID`, `Allocation %`, `start Dte`, `End Date`

The DB currently uses `@@unique([userId, projectId, startDate])` to upsert. This breaks any time the start date shifts.

---

## Agreed Direction

**Full replace per employee, scoped to imported rows only.**

When a new weekly file is uploaded:
1. Create a new `AllocationBatch` record (audit trail).
2. Collect all unique `employeeId`s present in the file.
3. Delete all existing allocations for those employees where `batchId IS NOT NULL` (i.e. previously imported rows only — manual allocations with `batchId = null` are never touched).
4. Insert all rows from the new file fresh, stamped with the new `batchId`.

**Why this handles every scenario correctly:**

| Scenario | Result |
|---|---|
| End date extended | New record replaces old ✅ |
| % change | New record replaces old ✅ |
| Start date shifts | Old deleted, new inserted ✅ |
| Resource removed from project | Old deleted (not in new file) ✅ |
| Employee removed entirely from file | Not in employee set → untouched (see note below) |
| Two sequential periods on same project | Both rows inserted fresh ✅ |
| Two periods merged into one | Old two deleted, one new inserted ✅ |
| One period split into two | Old one deleted, two new inserted ✅ |
| Manual allocations (batchId = null) | Never touched ✅ |

**Edge case — employee removed entirely from file:**  
If an employee doesn't appear in the new upload at all, their old imported allocations are NOT deleted (we don't know if they were intentionally omitted or genuinely left). Two options:
- Option A: Accept this — PM will manually remove them or they'll disappear on next upload that includes them.
- Option B: Track which employees were in the previous batch and prompt the user to confirm deletion of those not in the new file.

**Recommendation: Option A** to start — keep it simple, revisit if it causes problems.

---

## Implementation Plan (ready to build)

### Files to change

| File | Change |
|---|---|
| `src/app/api/import/allocations/route.ts` | Replace upsert logic with delete-then-insert per employee |
| `src/app/(app)/import/ImportClient.tsx` | No change needed — dry-run preview still works the same way |

### New route logic (pseudocode)

```ts
// 1. Resolve all employeeIds from the file rows
const employeeIds = [...new Set(rows.map(r => resolvedUserId(r.employeeId)))];

// 2. Delete existing imported allocations for these employees
await prisma.allocation.deleteMany({
  where: {
    userId:  { in: employeeIds },
    batchId: { not: null },        // only touch imported rows
  },
});

// 3. Insert all new rows with the new batchId
await prisma.allocation.createMany({
  data: rows.map(r => ({
    userId:      resolvedUserId(r.employeeId),
    projectId:   resolvedProjectId(r.projectId),
    startDate:   parseDate(r.startDate),
    endDate:     parseDate(r.endDate),
    hoursPerDay: pctToHpd(r.allocation, userCapacity),
    batchId:     newBatch.id,
  })),
  skipDuplicates: true,
});
```

### Dry-run preview change
The preview currently counts `wouldCreate` / `wouldUpdate`. With the new approach it becomes `wouldDelete` + `wouldCreate` — update the preview UI to show both numbers.

---

## What was built in this session (for context after /clear)

| Feature | Status |
|---|---|
| PM filter fixed — now uses project ownership (`project.managerId`) | ✅ Done |
| `Project.managerId` schema field + db push | ✅ Done |
| Projects import parses `PM` column from CSV → sets `managerId` | ✅ Done |
| `/my-projects` PM screen — projects as cards, inline allocation editing, Past/Current/Future sections | ✅ Done |
| Bench — Add Allocation button per resource (detailed + simple views) | ✅ Done |
| Bench — CSV export fixed for all 3 views (was always exporting detailed) | ✅ Done |
| Bench — End date shown clearly in project chips (two-line layout) | ✅ Done |
| Capacity page — Department filter added | ✅ Done |
| Team page — "Reports to (PM)" dropdown in edit modal | ✅ Done |

---

## How to continue tomorrow

Say: **"Continue from PENDING.md — implement the allocation import deduplication."**

Claude will read this file and start building the new import logic in `src/app/api/import/allocations/route.ts`.

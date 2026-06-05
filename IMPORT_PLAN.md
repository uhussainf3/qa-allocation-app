# Import Plan — RM Tool Data Migration

## ⚠️ CRITICAL DEVELOPMENT RULES
- ALL development happens on the `dev` branch only
- Dev database: `ep-lucky-frost-aqk6gply` (separate Neon project)
- Production database: `ep-round-hall-aok2kyf3` — DO NOT TOUCH
- NO push to `main` without explicit user testing and approval
- NO schema changes on production without user sign-off

---

## Dev Database Connection String
```
DATABASE_URL="postgresql://neondb_owner:npg_8MYSXTmu9ZOr@ep-lucky-frost-aqk6gply-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```
Update your local `.env` to this string when working on the `dev` branch.
Switch back to production string when done.

---

## Source Files
| File | Location | Purpose |
|------|----------|---------|
| `Employee_RM.csv` | `C:\Users\uhussain\Desktop\` | All employees from RM tool |
| `RM - Data.csv` | `C:\Users\uhussain\Desktop\` | All allocations from RM tool |
| `Projects File.csv` | Project root | All projects from RM tool |

---

## Division Name Mapping (Director → Division)
| Director Name | Director FomsId | Division Name |
|---------------|-----------------|---------------|
| Muhammad Fahad | 113 | Dynamics |
| Syed Abdul Nasir | 14 | NetSuite |
| Aneeq Hashmi | TBD | AI/ML & DATA |
| Hamza Azad | TBD | App Dev |
| Faisal Arshad Majeed | TBD | ECommerce |
| Shahzad Anees | 226 | Shahzad Anees Division |
| Muhammad Abdullah | 144 | Muhammad Abdullah Division |
| Ather Sultan | 304 | Ather Sultan Division |
| Any other director | — | `[Director Name] Division` |

> Director FomsIds are cross-referenced from Employee_RM.csv by matching Director Name.

---

## Role Mapping (RM Tool → App)
| RM `Role` | App `role` | App `jobTitle` |
|-----------|-----------|---------------|
| Dev | MEMBER | DEVELOPER |
| QA | MEMBER | QA_ENGINEER |
| PM | PROJECT_MANAGER | PROJECT_MANAGER |
| FC | MEMBER | FUNCTIONAL_CONSULTANT |
| UI | MEMBER | DEVELOPER |
| Product Manager | MEMBER | PRODUCT_MANAGER |
| Other | MEMBER | null |
| Director (any) | DIVISION_OWNER | PROJECT_MANAGER |

---

## Project Status Mapping
| Projects CSV `Status` | App `ProjectStatus` |
|-----------------------|---------------------|
| Active | ACTIVE |
| On Demand | ACTIVE |
| Close | COMPLETED |

---

## Allocation Conversion
- `hoursPerDay = (Allocation% ÷ 100) × 8`
- Based on standard 8h/day workday
- Examples: 100% → 8h, 50% → 4h, 25% → 2h

---

## Date Formats
| Source | Format | Example |
|--------|--------|---------|
| RM - Data.csv | `d-Mon-YY` | `2-Jun-26` → `2026-06-02` |
| Projects File.csv | `YYYY.MM.DD` | `2025.07.30` → `2025-07-30` |

---

## Schema Changes Required

### 1. Add `externalId` to User
```prisma
externalId  String?  @unique  // FomsId from RM tool
```

### 2. Add `externalId` to Project
```prisma
externalId  String?  @unique  // ProjectID from RM tool
```

### 3. New `AllocationBatch` model
```prisma
model AllocationBatch {
  id           String       @id @default(cuid())
  label        String       // e.g. "Week of 9 Jun 2026"
  uploadedAt   DateTime     @default(now())
  uploadedById String
  uploadedBy   User         @relation(fields: [uploadedById], references: [id])
  isCurrent    Boolean      @default(false)
  sourceFile   String       // original filename
  allocations  Allocation[]
}
```

### 4. Add `batchId` to Allocation
```prisma
batchId  String?
batch    AllocationBatch?  @relation(fields: [batchId], references: [id])
```

> Run `npx prisma db push` after schema changes — never `migrate dev`.

---

## Build Order

### Step 1 — Schema + DB *(~30 min)*
- Add `externalId` to User and Project
- Create `AllocationBatch` model
- Add `batchId` to Allocation
- Run `prisma db push` against dev DB only

### Step 2 — Import: Division Owners + Divisions *(~1 hr)*
- API route: `POST /api/import/divisions`
- Source: unique Director IDs from `Projects File.csv`
- Cross-ref `Employee_RM.csv` by `FomsId = DirectorID` → get email
- Create User with `role = DIVISION_OWNER`, store `externalId = FomsId`
- Create Division per director using name mapping table above

### Step 3 — Import: Projects *(~45 min)*
- API route: `POST /api/import/projects`
- Source: `Projects File.csv`
- Match `DirectorID` → Division (from Step 2)
- Store `externalId = ProjectID`
- Auto-generate `code` from ProjectID (e.g. `P-2419`)
- Map status: Active/On Demand → ACTIVE, Close → COMPLETED
- Skip: Sanctioned Hours, Customer (deferred)

### Step 4 — Import: Employees *(~1 hr)*
- API route: `POST /api/import/employees`
- Source: `Employee_RM.csv`
- Skip rows where `FomsId` already exists (directors from Step 2)
- Map `Role` → app `role` + `jobTitle` per mapping table
- Assign division by cross-referencing `RM - Data.csv` (dominant DirectorID for that employee)
- Default capacity: 40h/week
- Store `externalId = FomsId`

### Step 5 — Import: First Allocation Batch *(~1 hr)*
- API route: `POST /api/import/allocations`
- Source: `RM - Data.csv`
- Create `AllocationBatch` labeled `"Initial Import — [date]"`, `isCurrent = true`
- Match `Employee ID` → User by `externalId`
- Match `Project ID` → Project by `externalId`
- Convert `Allocation%` → `hoursPerDay`
- Parse dates from `d-Mon-YY` format
- Tag every allocation with `batchId`
- Show errors for unmatched employees/projects (don't fail entire import)

### Step 6 — Weekly Batch Upload UI *(~3-4 hrs)*
- Upload page for ADMIN + DIVISION_OWNER
- Upload `RM - Data.csv` → dry-run preview (X added, Y skipped, Z errors)
- On confirm: create new `AllocationBatch`, set previous `isCurrent = false`
- Batch selector on Allocations page
- Current batch: full add/edit/delete
- Old batches: read-only

---

## Deferred (Do Later)
- `Sanctioned Hours` field on Project
- `Customer` field on Project

---

## Estimated Total Dev Time
~9-10 hours across 2-3 sessions

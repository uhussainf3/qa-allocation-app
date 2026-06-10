# Codebase Rules & Gotchas

These rules exist because we have already hit these bugs in production.
Follow them exactly — do not deviate unless explicitly instructed.

---

## 1. `unstable_cache` — ALWAYS serialize dates inside the function

**Rule:** Every `unstable_cache` function that returns Prisma objects MUST convert all
`Date` fields to ISO strings **inside** the async function body, before returning.

**Why:** In production (Vercel), `unstable_cache` JSON-serialises its stored value.
`Date` objects survive as strings after the round-trip. If the page then calls
`.toISOString()` on what is now already a string, it throws:
`TypeError: toISOString is not a function` → 500 error.
In development `unstable_cache` does not cache, so the bug is invisible locally.

**Correct pattern (copy this):**
```ts
export const getCachedFoo = unstable_cache(
  async () => {
    const rows = await prisma.foo.findMany({ ... });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      startDate: r.startDate.toISOString(),
      // serialize every Date field
    }));
  },
  ["foo"],
  { revalidate: 60, tags: ["foo"] }
);
```

**Wrong pattern (never do this):**
```ts
// BAD — raw Prisma return, Date fields not serialized
export const getCachedFoo = unstable_cache(
  async () => prisma.foo.findMany({ ... }),  // ← Date objects leak out
  ["foo"],
  { revalidate: 60, tags: ["foo"] }
);
```

**Pages:** Because dates are already strings coming out of the cache, page
components must NOT call `.toISOString()` on the cached result. Just pass it
through directly.

---

## 2. `revalidateTag` — always pass TWO arguments

**Rule:** Always call `revalidateTag` with the 2-argument pattern:
```ts
revalidateTag("tag-name", "max" as never);
```

**Why:** This version of Next.js expects 2 arguments. Calling with 1 argument causes
a TypeScript error or silent failure.

---

## 3. Prisma schema changes — use `db push`, NOT `migrate dev`

**Rule:** Always run `npx prisma db push` to apply schema changes.
Never run `npx prisma migrate dev`.

**Why:** The project uses Neon (serverless Postgres). `migrate dev` creates migration
files and can break the Neon branch workflow. `db push` applies the schema directly.

---

## 4. Git — push to `github` remote only, never `origin`

**Rule:**
- `git push github main` — correct (GitHub → Vercel)
- `git push` or `git push origin` — WRONG (goes to Bitbucket, which is not used)

**Context:** There are two remotes:
- `github` → `https://github.com/uhussainf3/qa-allocation-app.git` (Vercel source)
- `origin` → Bitbucket (not used, never push here)

The `main` branch upstream is set to `github/main`.

**Deployment rule:** Always develop on the `dev` branch. Only push to `main` (GitHub)
after getting explicit approval from the user for a production deployment.

---

## 5. Role system — use the new roles everywhere

**Current roles (as of Folio3 multi-division expansion):**
```
ADMIN | EXECUTIVE | DIVISION_OWNER | PROJECT_MANAGER | MEMBER
```

**Old roles (do NOT use, removed from schema):**
```
MANAGEMENT | QA_ENGINEER  ← these no longer exist
```

Always check access control guards use only the current roles.

---

## 6. `searchParams` — always `await` in Next.js 15

**Rule:** In Next.js 15 App Router, `searchParams` is a Promise. Always await it:
```ts
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const { division } = await searchParams;
}
```
Never destructure it directly without awaiting.

---

## 7. Server components + client filters

**Pattern for pages with division filters:**
- **Server-rendered pages** (Capacity, Forecast): use URL `searchParams` + `DivisionFilter`
  component wrapped in `<Suspense>`. Filter users server-side before passing to JSX.
- **Client pages** (Allocations, Projects, Bench, Manage Allocations): pass `divisions`
  prop to the client component and manage filter state with `useState`.

---

## 8. Cache tag invalidation — always invalidate after mutations

After any write (create / update / delete) in an API route, invalidate the relevant tags:
```ts
revalidateTag("users",       "max" as never);
revalidateTag("allocations", "max" as never);
revalidateTag("projects",    "max" as never);
revalidateTag("divisions",   "max" as never);
revalidateTag("leaves",      "max" as never);
revalidateTag("holidays",    "max" as never);
```
Only invalidate the tags affected by the mutation (not all of them every time).

---

## 9. Unit testing — MANDATORY for every feature, fix, and enhancement

**Rule:** Every new feature, bug fix, or enhancement MUST include unit tests
before the work is considered done. Tests must pass (`npx vitest run`) before
any commit is made. This is not optional.

---

### 9a. When tests are required

| Change type | Tests required |
|-------------|---------------|
| New feature | Yes — cover the core business logic |
| Bug fix | Yes — add a test that would have caught the bug |
| Enhancement | Yes — cover the new behaviour path |
| Refactor | Yes — existing tests must still pass; add new ones if logic changes |
| Schema-only change | No — but regenerate Prisma client (see Rule §3 + §9d) |
| UI copy / style tweak | No — pure cosmetic, no logic |

---

### 9b. The extract-then-test pattern (mandatory)

Business logic embedded inside API routes, server components, or React
components cannot be tested directly. **Always extract pure logic into a
`src/lib/[feature]Utils.ts` file first**, then test those functions.

**Directory layout:**
```
src/lib/
  benchUtils.ts          ← pure computation functions
  leaveUtils.ts          ← pure approval-state-machine functions
  importUtils.ts         ← pure CSV / allocation helpers
  __tests__/
    benchUtils.test.ts
    leaveUtils.test.ts
    importUtils.test.ts
```

**What qualifies as extractable pure logic:**
- Percentage / hours calculations (e.g. `computeOnBenchPct`)
- State machine transitions (e.g. `deriveLeaveStatus`)
- Data transformations and aggregations (e.g. `buildRoleTiles`)
- Approval chain construction (e.g. `buildApprovalChain`)
- CSV parsing helpers (e.g. `parseRMDate`, `computeCsvRange`)
- Filter / sort predicates
- Any function whose output depends only on its inputs (no DB, no HTTP)

**What does NOT belong in a utils file (and does NOT need unit tests):**
- Prisma queries — integration-test territory, requires a real DB
- React component JSX — browser/DOM territory, requires Testing Library
- Next.js routing / middleware — framework territory
- `fetch` / HTTP calls — mock-heavy, low ROI for this project

---

### 9c. Minimum test scenarios for every function

Every tested function must cover at minimum:

| Scenario category | Example |
|-------------------|---------|
| **Happy path** | Typical input → expected output |
| **Edge / boundary** | Zero, empty list, 100%, exact threshold |
| **Null / undefined inputs** | `null` department, missing optional fields |
| **Clamping / guards** | Over-allocated → 0%, negative never returned |
| **Error / rejection path** | Wrong status, rejected approval, fallback logic |

For state machines (like leave approval), test **every transition**:
- PENDING → PM_APPROVED
- PM_APPROVED → APPROVED
- PM_APPROVED → REJECTED
- PENDING → APPROVED (auto-approve when no L2 exists)
- Any partial / mixed state → PENDING

---

### 9d. What unit tests CANNOT catch (document the gap)

Unit tests verify pure logic. They do NOT catch:

| Gap | Correct fix |
|-----|-------------|
| **Stale Prisma client** after schema change | Stop dev server → `npx prisma generate` → restart (Rule §3) |
| **Missing `revalidateTag`** after a mutation | Code review + Rule §8 |
| **Wrong `unstable_cache` serialisation** | Code review + Rule §1 |
| **Runtime env var missing** | Check `.env.local` |
| **DB constraint violation** | Check schema + Prisma error message |

When a bug is NOT caught by unit tests, add a comment in the test file
explaining why (e.g. `// Prisma query shape — requires integration test`).

---

### 9e. Running the test suite

```bash
# Run all tests once (required before every commit)
npx vitest run

# Run in watch mode during development
npx vitest

# Run a single file
npx vitest run src/lib/__tests__/leaveUtils.test.ts

# Verbose output (shows every test name)
npx vitest run --reporter=verbose
```

**Gate:** The commit message must not be written until `npx vitest run` exits
with `Tests  N passed (N)` and zero failures. If any test fails, fix the code
(or the test if the expected behaviour changed) before committing.

---

### 9f. Test file conventions

```ts
import { describe, it, expect } from "vitest";
import { myFunction } from "../myUtils";

// Group by function name
describe("myFunction", () => {
  it("describes the expected behaviour in plain English", () => {
    expect(myFunction(input)).toBe(expectedOutput);
  });
});
```

- One `describe` block per exported function
- Test names start with a verb: *"returns …"*, *"throws …"*, *"ignores …"*
- Use a `rec()` / `utc()` style local helper to keep test data concise
- Never share mutable state between tests (`const` fixtures only)

---

### 9h. Integration tests — API contract tests

When a bug lives at the boundary between the API route and the client component
(wrong response shape, missing field, date as Date object vs string), write an
**API contract integration test** — not just a unit test.

**Where to put them:**
```
src/app/api/[route]/__tests__/[route]Api.integration.test.ts
```

**The pattern (copy this):**
```ts
// 1. Mock next/cache so the route module loads without the Next.js runtime
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

// 2. Replace NextResponse with standard Web Response so Vitest runs in plain Node
vi.mock("@/lib/apiResponse", () => ({
  ok:           (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  err:          (msg, status = 400)  => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } }),
  unauthorized: ()                   => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } }),
}));

// 3. Mock DB and auth
vi.mock("@/lib/auth",   () => ({ auth:   vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    foo: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    // include every model method the route touches so the module loads cleanly
  },
}));

// 4. Import the actual handler — not a copy, the real one
import { GET } from "@/app/api/foo/route";
import { prisma } from "@/lib/prisma";
import { auth }   from "@/lib/auth";
```

**What to assert:**
- **Shape contract** — field names that the client TypeScript type expects (`approverName`, not `approver.name`)
- **No leaked objects** — nested Prisma objects must NOT appear if the client expects a flat field
- **Date serialization** — all date fields must be ISO strings (`typeof x === "string"`)
- **Authentication guard** — `null` session → 401
- **Empty-list edge case** — no rows → 200 with `[]`, not an error

**Real example:**
- `src/app/api/leave/__tests__/leaveApi.integration.test.ts` (16 tests)
  - Guards against the `approver.name` vs `approverName` shape-mismatch bug

---

### 9g. Updating SCOPE.md when tests are added

When a feature row is marked ✅ Done, the Notes column must mention whether
unit tests were added:

```
| 36 | Bench role tiles + +60d | ✅ Done | Role tiles per dept; ... benchUtils.test.ts (22 tests) |
```

This makes it easy to audit test coverage across the whole feature tracker.

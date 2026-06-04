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

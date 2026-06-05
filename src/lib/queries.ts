/**
 * Cached database query functions using Next.js unstable_cache.
 * Cache TTL: 60 seconds with tag-based on-demand invalidation.
 *
 * Tags:
 *   "users"       — invalidated when users change
 *   "projects"    — invalidated when projects change
 *   "allocations" — invalidated when allocations change
 *   "leaves"      — invalidated when leave records change
 */
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

const TTL = 60; // seconds

// ─── Users ────────────────────────────────────────────────────────────────────

/** Active users with full select (for Allocations page, dropdowns). Excludes VP job title. */
export const getCachedActiveUsers = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ jobTitle: null }, { jobTitle: { not: "VP" } }],
      },
      select: { id: true, name: true, email: true, image: true, capacity: true, role: true, jobTitle: true, divisionId: true, department: true },
      orderBy: { name: "asc" },
    }),
  ["active-users"],
  { revalidate: TTL, tags: ["users"] }
);

/** Active users — minimal select (capacity + bench pages). Excludes VP job title. */
export const getCachedSimpleUsers = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ jobTitle: null }, { jobTitle: { not: "VP" } }],
      },
      select: { id: true, name: true, email: true, capacity: true, role: true, jobTitle: true, divisionId: true, department: true },
      orderBy: { name: "asc" },
    }),
  ["simple-users"],
  { revalidate: TTL, tags: ["users"] }
);

// ─── Projects ─────────────────────────────────────────────────────────────────

/** Active projects — minimal select for dropdowns. */
export const getCachedActiveProjects = unstable_cache(
  async () =>
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, code: true, color: true, divisionId: true },
    }),
  ["active-projects"],
  { revalidate: TTL, tags: ["projects"] }
);

/**
 * Full projects data for the Projects page.
 * Dates are pre-serialised to ISO strings so the result is safe for
 * JSON caching and passes directly to ProjectsClient.
 */
export const getCachedProjectsFull = unstable_cache(
  async () => {
    const [projects, hoursConsumed] = await Promise.all([
      prisma.project.findMany({
        include: {
          tasks: {
            include: { subtasks: { orderBy: { order: "asc" } } },
            where: { parentId: null },
            orderBy: { order: "asc" },
          },
          _count: { select: { allocations: true, hoursLogs: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.hoursLog.groupBy({ by: ["projectId"], _sum: { hours: true } }),
    ]);

    return {
      projects: projects.map((p) => ({
        ...p,
        startDate: p.startDate?.toISOString() ?? null,
        endDate:   p.endDate?.toISOString()   ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        tasks: p.tasks.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          subtasks: t.subtasks.map((s) => ({
            ...s,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
        })),
      })),
      hoursConsumed,
    };
  },
  ["projects-full"],
  { revalidate: TTL, tags: ["projects"] }
);

// ─── Allocations ──────────────────────────────────────────────────────────────

/** All allocations (manages-allocations list). Excludes VP job title. Dates as ISO strings. */
export const getCachedAllAllocationsList = unstable_cache(
  async () => {
    const rows = await prisma.allocation.findMany({
      where: {
        user: { OR: [{ jobTitle: null }, { jobTitle: { not: "VP" } }] },
      },
      include: {
        user:    { select: { id: true, name: true, email: true, image: true, capacity: true, role: true, jobTitle: true, divisionId: true } },
        project: { select: { id: true, name: true, code: true, color: true } },
        task:    { select: { id: true, name: true } },
      },
      orderBy: [{ startDate: "asc" }, { user: { name: "asc" } }],
    });
    return rows.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  },
  ["allocations-list"],
  { revalidate: TTL, tags: ["allocations", "users", "projects"] }
);

/**
 * Allocations overlapping a date range — includes project + task.
 * Used by the Allocations grid page. Dates as ISO strings.
 */
const _getAllocationsInRange = unstable_cache(
  async (fromISO: string, toISO: string) => {
    const rows = await prisma.allocation.findMany({
      where: {
        startDate: { lt: new Date(toISO) },
        endDate:   { gte: new Date(fromISO) },
      },
      include: {
        project: { select: { id: true, name: true, code: true, color: true } },
        task:    { select: { id: true, name: true } },
      },
    });
    return rows.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  },
  ["allocations-in-range"],
  { revalidate: TTL, tags: ["allocations"] }
);
export const getCachedAllocationsInRange = (from: string, to: string) =>
  _getAllocationsInRange(from, to);

/**
 * Minimal allocations overlapping a range (no relations).
 * Used by capacity / bench / forecast pages. Dates as ISO strings.
 */
const _getAllocationsMinimal = unstable_cache(
  async (fromISO: string, toISO: string) => {
    const rows = await prisma.allocation.findMany({
      where: {
        startDate: { lt: new Date(toISO) },
        endDate:   { gte: new Date(fromISO) },
      },
      select: { userId: true, startDate: true, endDate: true, hoursPerDay: true },
    });
    return rows.map((a) => ({
      userId:      a.userId,
      hoursPerDay: a.hoursPerDay,
      startDate:   a.startDate.toISOString(),
      endDate:     a.endDate.toISOString(),
    }));
  },
  ["allocations-minimal"],
  { revalidate: TTL, tags: ["allocations"] }
);
export const getCachedAllocationsMinimal = (from: string, to: string) =>
  _getAllocationsMinimal(from, to);

/**
 * Allocations with project for the Conflicts page. Dates as ISO strings.
 */
const _getConflictAllocations = unstable_cache(
  async (fromISO: string, toISO: string) => {
    const rows = await prisma.allocation.findMany({
      where: {
        startDate: { lt: new Date(toISO) },
        endDate:   { gte: new Date(fromISO) },
      },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    return rows.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate:   a.endDate.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  },
  ["allocations-conflicts"],
  { revalidate: TTL, tags: ["allocations"] }
);
export const getCachedConflictAllocations = (from: string, to: string) =>
  _getConflictAllocations(from, to);

/**
 * All allocations for the Projects page — includes userId + userName for
 * the per-engineer "hours to date" breakdown tile.
 */
export const getCachedAllAllocationsForProjects = unstable_cache(
  async () => {
    const rows = await prisma.allocation.findMany({
      select: {
        projectId:   true,
        startDate:   true,
        endDate:     true,
        hoursPerDay: true,
        userId:      true,
        user:        { select: { name: true } },
      },
    });
    return rows.map((a) => ({
      projectId:   a.projectId,
      hoursPerDay: a.hoursPerDay,
      startDate:   a.startDate.toISOString(),
      endDate:     a.endDate.toISOString(),
      userId:      a.userId,
      userName:    a.user.name,
    }));
  },
  ["allocations-for-projects"],
  { revalidate: TTL, tags: ["allocations", "users"] }
);

// ─── Public Holidays ──────────────────────────────────────────────────────────

/** All public holidays (YYYY-MM-DD strings), ordered by date. */
export const getCachedPublicHolidays = unstable_cache(
  async () => {
    try {
      const rows = await prisma.publicHoliday.findMany({ orderBy: { date: "asc" } });
      return rows.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name }));
    } catch {
      // Gracefully degrade if the table doesn't exist yet (e.g. pending migration)
      return [] as { id: string; date: string; name: string }[];
    }
  },
  ["public-holidays"],
  { revalidate: TTL, tags: ["holidays"] }
);

// ─── Divisions ────────────────────────────────────────────────────────────────

/** All divisions with owner + member/project counts. Dates serialised to ISO strings. */
export const getCachedDivisions = unstable_cache(
  async () => {
    const rows = await prisma.division.findMany({
      include: {
        owner:  { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, projects: true } },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  },
  ["divisions"],
  { revalidate: TTL, tags: ["divisions"] }
);

// ─── Team (all users with division) ───────────────────────────────────────────

/** All users (active + inactive) with division info — for Team page. Dates serialised to ISO strings. */
export const getCachedAllUsers = unstable_cache(
  async () => {
    const rows = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, image: true,
        role: true, jobTitle: true, capacity: true,
        department: true, isActive: true, divisionId: true, createdAt: true,
        division: { select: { id: true, name: true, code: true, color: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return rows.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    }));
  },
  ["all-users"],
  { revalidate: TTL, tags: ["users"] }
);

// ─── Job Titles ───────────────────────────────────────────────────────────────

/** All job titles ordered alphabetically. Dates serialised to ISO strings. */
export const getCachedJobTitles = unstable_cache(
  async () => {
    const rows = await prisma.jobTitle.findMany({ orderBy: { name: "asc" } });
    return rows.map((j) => ({
      id:        j.id,
      name:      j.name,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }));
  },
  ["job-titles"],
  { revalidate: TTL, tags: ["job-titles"] }
);

// ─── Leaves ───────────────────────────────────────────────────────────────────

/** Approved leaves overlapping a range (for Capacity page). Dates as ISO strings. */
const _getApprovedLeaves = unstable_cache(
  async (fromISO: string, toISO: string) => {
    const rows = await prisma.leave.findMany({
      where: {
        status:    "APPROVED",
        startDate: { lt: new Date(toISO) },
        endDate:   { gte: new Date(fromISO) },
      },
      select: { userId: true, startDate: true, endDate: true, type: true },
    });
    return rows.map((l) => ({
      userId:    l.userId,
      type:      l.type,
      startDate: l.startDate.toISOString(),
      endDate:   l.endDate.toISOString(),
    }));
  },
  ["approved-leaves"],
  { revalidate: TTL, tags: ["leaves"] }
);
export const getCachedApprovedLeaves = (from: string, to: string) =>
  _getApprovedLeaves(from, to);

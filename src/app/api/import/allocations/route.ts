import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// Parse "d-Mon-YY" → Date (UTC midnight)
// Examples: "2-Jun-26" → 2026-06-02, "30-Apr-25" → 2025-04-30
function parseRMDate(raw: string): Date | null {
  if (!raw || raw.trim() === "") return null;
  const [dayStr, monStr, yrStr] = raw.trim().split("-");
  if (!dayStr || !monStr || !yrStr) return null;

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const month = months[monStr.toLowerCase()];
  if (!month) return null;

  const year = parseInt(yrStr) < 100 ? 2000 + parseInt(yrStr) : parseInt(yrStr);
  const day  = dayStr.padStart(2, "0");
  const d    = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

// POST /api/import/allocations
// Body: {
//   label:      string;
//   sourceFile: string;
//   dryRun?:    boolean;
//   rows: Array<{
//     employeeId:  string;   // FomsId / externalId on User
//     empName:     string;   // Emp Name column — used to auto-create missing users
//     projectId:   string;   // RM ProjectID / externalId on Project
//     projectName: string;   // Project Name column — used to auto-create missing projects
//     directorId:  string;   // Director ID — used to derive division for auto-created records
//     allocation:  number;   // Allocation % (0–100)
//     startDate:   string;   // "d-Mon-YY"
//     endDate:     string;   // "d-Mon-YY"
//   }>
// }
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!["ADMIN", "DIVISION_OWNER"].includes(session.user.role)) return err("Forbidden", 403);

  const body = await req.json();
  const { label, sourceFile, rows, dryRun = false } = body as {
    label:      string;
    sourceFile: string;
    dryRun?:    boolean;
    rows: Array<{
      employeeId:  string;
      empName:     string;
      projectId:   string;
      projectName: string;
      directorId:  string;
      allocation:  number;
      startDate:   string;
      endDate:     string;
    }>;
  };

  if (!label)                                        return err("label is required");
  if (!sourceFile)                                   return err("sourceFile is required");
  if (!sourceFile.toLowerCase().endsWith(".csv"))    return err("Only CSV files are accepted");
  if (!Array.isArray(rows) || rows.length === 0)     return err("rows must be a non-empty array");

  // ── Pre-load lookup tables ────────────────────────────────────────────────
  const [allUsers, allProjects, allDivisions] = await Promise.all([
    prisma.user.findMany({ where: { externalId: { not: null } }, select: { id: true, externalId: true } }),
    prisma.project.findMany({ where: { externalId: { not: null } }, select: { id: true, externalId: true } }),
    prisma.division.findMany({ select: { id: true, ownerId: true } }),
  ]);

  const userMap        = new Map(allUsers.map((u) => [u.externalId!, u.id]));
  const projectMap     = new Map(allProjects.map((p) => [p.externalId!, p.id]));
  const ownerToDivision = new Map(allDivisions.map((d) => [d.ownerId, d.id]));

  // ── Identify missing entities (deduplicated by externalId) ─────────────────
  type EntityMeta = { name: string; directorId: string };
  const missingEmployees = new Map<string, EntityMeta>();
  const missingProjects  = new Map<string, EntityMeta>();

  for (const row of rows) {
    if (!userMap.has(row.employeeId) && row.empName)
      missingEmployees.set(row.employeeId, { name: row.empName, directorId: row.directorId });
    if (!projectMap.has(row.projectId) && row.projectName)
      missingProjects.set(row.projectId, { name: row.projectName, directorId: row.directorId });
  }

  // ── DRY RUN ───────────────────────────────────────────────────────────────
  if (dryRun) {
    const errors: { row: number; message: string }[] = [];
    let wouldCreate = 0;
    let wouldUpdate = 0;

    // Simulate maps with auto-creates so downstream lookup works
    const simUserMap    = new Map(userMap);
    const simProjectMap = new Map(projectMap);
    for (const [id] of missingEmployees) simUserMap.set(id, `__new_${id}`);
    for (const [id] of missingProjects)  simProjectMap.set(id, `__new_${id}`);

    for (let i = 0; i < rows.length; i++) {
      const { employeeId, projectId, startDate, endDate } = rows[i];

      const userId   = simUserMap.get(employeeId);
      const projDbId = simProjectMap.get(projectId);

      if (!userId)   { errors.push({ row: i + 1, message: `Employee not found: externalId=${employeeId} (no name available to auto-create)` }); continue; }
      if (!projDbId) { errors.push({ row: i + 1, message: `Project not found: externalId=${projectId} (no name available to auto-create)` }); continue; }

      const start = parseRMDate(startDate);
      const end   = parseRMDate(endDate);
      if (!start || !end) { errors.push({ row: i + 1, message: `Invalid dates: start="${startDate}" end="${endDate}"` }); continue; }

      // Auto-created entities always produce new allocations; existing ones may update
      if (userId.startsWith("__new_") || projDbId.startsWith("__new_")) {
        wouldCreate++;
      } else {
        const exists = await prisma.allocation.findUnique({
          where: { userId_projectId_startDate: { userId, projectId: projDbId, startDate: start } },
          select: { id: true },
        });
        if (exists) wouldUpdate++; else wouldCreate++;
      }
    }

    return ok({
      dryRun: true,
      wouldCreate,
      wouldUpdate,
      employeesWouldCreate: [...missingEmployees.entries()].map(([externalId, { name }]) => ({ externalId, name })),
      projectsWouldCreate:  [...missingProjects.entries()].map(([externalId, { name }])  => ({ externalId, name })),
      errors,
    });
  }

  // ── REAL IMPORT ───────────────────────────────────────────────────────────

  // Step 1 — auto-create missing employees
  const employeesAutoCreated: { externalId: string; name: string }[] = [];
  for (const [externalId, { name, directorId }] of missingEmployees) {
    try {
      const directorUserId = userMap.get(directorId);
      const divisionId     = directorUserId ? ownerToDivision.get(directorUserId) ?? null : null;
      const user = await prisma.user.create({
        data: {
          name,
          email:      `emp.${externalId}@import.local`,
          externalId,
          role:       "MEMBER",
          capacity:   40,
          divisionId,
          isActive:   true,
        },
      });
      userMap.set(externalId, user.id);
      employeesAutoCreated.push({ externalId, name });
    } catch {
      // May already exist (race / re-run) — just pick up the existing id
      const existing = await prisma.user.findUnique({ where: { externalId }, select: { id: true } });
      if (existing) userMap.set(externalId, existing.id);
    }
  }

  // Step 2 — auto-create missing projects
  const projectsAutoCreated: { externalId: string; name: string }[] = [];
  for (const [externalId, { name, directorId }] of missingProjects) {
    try {
      const directorUserId = userMap.get(directorId);
      const divisionId     = directorUserId ? ownerToDivision.get(directorUserId) ?? null : null;
      const project = await prisma.project.create({
        data: {
          name,
          code:       externalId,
          externalId,
          status:     "ACTIVE",
          color:      "#6366f1",
          divisionId,
        },
      });
      projectMap.set(externalId, project.id);
      projectsAutoCreated.push({ externalId, name });
    } catch {
      const existing = await prisma.project.findUnique({ where: { externalId }, select: { id: true } });
      if (existing) projectMap.set(externalId, existing.id);
    }
  }

  // Step 3 — retire previous current batch and create new one
  await prisma.allocationBatch.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

  const batch = await prisma.allocationBatch.create({
    data: { label, sourceFile, isCurrent: true, uploadedById: session.user.id },
  });

  // Step 4 — upsert allocations
  let created = 0;
  let updated = 0;
  const writeErrors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { employeeId, projectId, allocation, startDate, endDate } = rows[i];

    const userId   = userMap.get(employeeId);
    const projDbId = projectMap.get(projectId);

    if (!userId)   { writeErrors.push({ row: i + 1, message: `Employee not found: ${employeeId}` }); continue; }
    if (!projDbId) { writeErrors.push({ row: i + 1, message: `Project not found: ${projectId}` });   continue; }

    const start = parseRMDate(startDate);
    const end   = parseRMDate(endDate);
    if (!start || !end) { writeErrors.push({ row: i + 1, message: `Invalid dates: "${startDate}" – "${endDate}"` }); continue; }

    const hoursPerDay = Math.round(((allocation / 100) * 8) * 100) / 100;

    try {
      const existing = await prisma.allocation.findUnique({
        where: { userId_projectId_startDate: { userId, projectId: projDbId, startDate: start } },
        select: { id: true },
      });
      if (existing) {
        await prisma.allocation.update({
          where: { id: existing.id },
          data:  { endDate: end, hoursPerDay, batchId: batch.id },
        });
        updated++;
      } else {
        await prisma.allocation.create({
          data: { userId, projectId: projDbId, startDate: start, endDate: end, hoursPerDay, batchId: batch.id },
        });
        created++;
      }
    } catch (e) {
      writeErrors.push({ row: i + 1, message: String(e) });
    }
  }

  // Step 5 — store log on the batch record (best-effort; don't fail the import if this errors)
  try {
    const log = {
      uploadedBy:           session.user.name ?? session.user.email ?? session.user.id,
      uploadedAt:           new Date().toISOString(),
      totalRows:            rows.length,
      allocationsCreated:   created,
      allocationsUpdated:   updated,
      employeesAutoCreated,
      projectsAutoCreated,
      errors:               writeErrors,
    };
    await prisma.allocationBatch.update({ where: { id: batch.id }, data: { log } });
  } catch {
    // Log save failed (likely stale Prisma client — run `npx prisma generate` to fix)
  }

  revalidateTag("allocations", "max" as never);
  revalidateTag("users",       "max" as never);
  revalidateTag("projects",    "max" as never);

  return ok({
    batchId:             batch.id,
    label:               batch.label,
    created,
    updated,
    employeesAutoCreated,
    projectsAutoCreated,
    errors:              writeErrors,
  });
}

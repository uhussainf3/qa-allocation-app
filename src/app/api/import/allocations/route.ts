import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import {
  parseRMDate,
  computeCsvRange,
  buildCsvPairKey,
  detectIntraCSVOverlaps,
  detectDuplicateRows,
  buildPercentChangeNote,
  buildOverlapNote,
} from "@/lib/importUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CsvInputRow = {
  employeeId:  string;   // FomsId / externalId on User
  empName:     string;   // used to auto-create missing users
  projectId:   string;   // RM ProjectID / externalId on Project
  projectName: string;   // used to auto-create missing projects
  directorId:  string;   // used to derive division for auto-created records
  allocation:  number;   // Allocation % (0–100)
  startDate:   string;   // "d-Mon-YY"
  endDate:     string;   // "d-Mon-YY"
};

// A row that has been fully validated and resolved to internal DB ids
type ValidatedRow = {
  rowIndex:    number;   // 1-based original CSV index
  userId:      string;   // internal User.id
  projectId:   string;   // internal Project.id
  employeeId:  string;   // original externalId (for log messages)
  extProjectId: string;  // original externalId (for log messages)
  start:       Date;
  end:         Date;
  hoursPerDay: number;
};

// A row that was skipped during pre-validation
type SkippedRow = {
  row:         number;   // 1-based
  employeeId:  string;
  projectId:   string;
  startDate:   string;
  endDate:     string;
  reason:      string;
};

// ─── POST /api/import/allocations ────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (!["ADMIN", "DIVISION_OWNER"].includes(session.user.role))
    return err("Forbidden", 403);

  const body = await req.json();
  const { label, sourceFile, rows, dryRun = false } = body as {
    label:      string;
    sourceFile: string;
    dryRun?:    boolean;
    rows:       CsvInputRow[];
  };

  if (!label)                                     return err("label is required");
  if (!sourceFile)                                return err("sourceFile is required");
  if (!sourceFile.toLowerCase().endsWith(".csv")) return err("Only CSV files are accepted");
  if (!Array.isArray(rows) || rows.length === 0)  return err("rows must be a non-empty array");

  // ── Step 1: Pre-load lookup tables ─────────────────────────────────────────

  const [allUsers, allProjects, allDivisions] = await Promise.all([
    prisma.user.findMany({
      where:  { externalId: { not: null } },
      select: { id: true, externalId: true },
    }),
    prisma.project.findMany({
      where:  { externalId: { not: null } },
      select: { id: true, externalId: true },
    }),
    prisma.division.findMany({ select: { id: true, ownerId: true } }),
  ]);

  const userMap         = new Map(allUsers.map((u)  => [u.externalId!, u.id]));
  const projectMap      = new Map(allProjects.map((p) => [p.externalId!, p.id]));
  const ownerToDivision = new Map(allDivisions.map((d) => [d.ownerId, d.id]));

  // ── Step 2: Identify missing entities ──────────────────────────────────────

  type EntityMeta = { name: string; directorId: string };
  const missingEmployees = new Map<string, EntityMeta>();
  const missingProjects  = new Map<string, EntityMeta>();

  for (const row of rows) {
    if (!userMap.has(row.employeeId) && row.empName)
      missingEmployees.set(row.employeeId, { name: row.empName, directorId: row.directorId });
    if (!projectMap.has(row.projectId) && row.projectName)
      missingProjects.set(row.projectId, { name: row.projectName, directorId: row.directorId });
  }

  // ── DRY RUN PATH ───────────────────────────────────────────────────────────

  if (dryRun) {
    const skippedRows: SkippedRow[] = [];

    // Simulate maps with auto-creates
    const simUserMap    = new Map(userMap);
    const simProjectMap = new Map(projectMap);
    for (const [id] of missingEmployees) simUserMap.set(id, `__new_${id}`);
    for (const [id] of missingProjects)  simProjectMap.set(id, `__new_${id}`);

    // Pre-validate rows
    const validRows: ValidatedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const userId   = simUserMap.get(raw.employeeId);
      const projDbId = simProjectMap.get(raw.projectId);

      if (!userId) {
        skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Employee not found: externalId=${raw.employeeId} (no name available to auto-create)` });
        continue;
      }
      if (!projDbId) {
        skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Project not found: externalId=${raw.projectId} (no name available to auto-create)` });
        continue;
      }

      const start = parseRMDate(raw.startDate);
      const end   = parseRMDate(raw.endDate);

      if (!start) {
        skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Invalid or missing start date: "${raw.startDate}"` });
        continue;
      }
      if (!end) {
        skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Invalid or missing end date: "${raw.endDate}"` });
        continue;
      }

      const hoursPerDay = Math.round(((raw.allocation / 100) * 8) * 100) / 100;
      validRows.push({ rowIndex: i + 1, userId, projectId: projDbId, employeeId: raw.employeeId, extProjectId: raw.projectId, start, end, hoursPerDay });
    }

    // Detect overlaps and duplicates
    const overlapConflicts = detectIntraCSVOverlaps(validRows);
    const duplicates       = detectDuplicateRows(validRows);
    const duplicateRows    = new Set(duplicates.map((d) => d.duplicateRow));

    // Add duplicates to skippedRows
    for (const d of duplicates) {
      const raw = rows[d.duplicateRow - 1];
      skippedRows.push({
        row:        d.duplicateRow,
        employeeId: raw.employeeId,
        projectId:  raw.projectId,
        startDate:  raw.startDate,
        endDate:    raw.endDate,
        reason:     `Duplicate row — same employee, project, and start date as row ${d.originalRow}. Only the first occurrence will be imported.`,
      });
    }

    const insertRows = validRows.filter((r) => !duplicateRows.has(r.rowIndex));
    const csvRange   = computeCsvRange(validRows);

    // Estimate creates vs deletes
    let wouldCreate = 0;
    let wouldDelete = 0;

    if (csvRange) {
      const csvPairs = new Set(insertRows.map((r) => buildCsvPairKey(r.userId, r.projectId)));

      // Count existing batch allocations that would be deleted (scoped to csvPairs + range)
      const existingBatch = await prisma.allocation.findMany({
        where: {
          batchId:   { not: null },
          startDate: { lte: csvRange.maxEnd },
          endDate:   { gte: csvRange.minStart },
        },
        select: { userId: true, projectId: true },
      });

      wouldDelete = existingBatch.filter((a) =>
        csvPairs.has(buildCsvPairKey(a.userId, a.projectId))
      ).length;
    }

    wouldCreate = insertRows.length;

    return ok({
      dryRun:                true,
      wouldCreate,
      wouldDelete,
      wouldUpdate:           0,   // kept for UI backward compat — new algorithm has no "update"
      employeesWouldCreate:  [...missingEmployees.entries()].map(([externalId, { name }]) => ({ externalId, name })),
      projectsWouldCreate:   [...missingProjects.entries()].map(([externalId, { name }])  => ({ externalId, name })),
      overlapsDetected:      overlapConflicts.length,
      skippedRows,
      errors:                skippedRows.map((s) => ({ row: s.row, message: s.reason })), // backward compat
      csvRange:              csvRange ? { minStart: csvRange.minStart.toISOString(), maxEnd: csvRange.maxEnd.toISOString() } : null,
    });
  }

  // ── REAL IMPORT ────────────────────────────────────────────────────────────

  // Step 3: Auto-create missing employees
  const employeesAutoCreated: { externalId: string; name: string }[] = [];
  for (const [externalId, { name, directorId }] of missingEmployees) {
    try {
      const directorUserId = userMap.get(directorId);
      const divisionId     = directorUserId ? (ownerToDivision.get(directorUserId) ?? null) : null;
      const user = await prisma.user.create({
        data: { name, email: `emp.${externalId}@import.local`, externalId, role: "MEMBER", capacity: 40, divisionId, isActive: true },
      });
      userMap.set(externalId, user.id);
      employeesAutoCreated.push({ externalId, name });
    } catch {
      const existing = await prisma.user.findUnique({ where: { externalId }, select: { id: true } });
      if (existing) userMap.set(externalId, existing.id);
    }
  }

  // Step 4: Auto-create missing projects
  const projectsAutoCreated: { externalId: string; name: string }[] = [];
  for (const [externalId, { name, directorId }] of missingProjects) {
    try {
      const directorUserId = userMap.get(directorId);
      const divisionId     = directorUserId ? (ownerToDivision.get(directorUserId) ?? null) : null;
      const project = await prisma.project.create({
        data: { name, code: externalId, externalId, status: "ACTIVE", color: "#6366f1", divisionId },
      });
      projectMap.set(externalId, project.id);
      projectsAutoCreated.push({ externalId, name });
    } catch {
      const existing = await prisma.project.findUnique({ where: { externalId }, select: { id: true } });
      if (existing) projectMap.set(externalId, existing.id);
    }
  }

  // Step 5: Pre-validate all rows → resolve to internal ids
  const skippedRows: SkippedRow[] = [];
  const validRows:   ValidatedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw      = rows[i];
    const userId   = userMap.get(raw.employeeId);
    const projDbId = projectMap.get(raw.projectId);

    if (!userId) {
      skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Employee not found: ${raw.employeeId}` });
      continue;
    }
    if (!projDbId) {
      skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Project not found: ${raw.projectId}` });
      continue;
    }

    const start = parseRMDate(raw.startDate);
    const end   = parseRMDate(raw.endDate);

    if (!start) {
      skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Invalid or missing start date: "${raw.startDate}"` });
      continue;
    }
    if (!end) {
      skippedRows.push({ row: i + 1, employeeId: raw.employeeId, projectId: raw.projectId, startDate: raw.startDate, endDate: raw.endDate, reason: `Invalid or missing end date: "${raw.endDate}"` });
      continue;
    }

    const hoursPerDay = Math.round(((raw.allocation / 100) * 8) * 100) / 100;
    validRows.push({ rowIndex: i + 1, userId, projectId: projDbId, employeeId: raw.employeeId, extProjectId: raw.projectId, start, end, hoursPerDay });
  }

  if (validRows.length === 0) {
    return err("No valid rows to import after pre-validation. Check employee/project IDs and date formats.");
  }

  // Step 6: Compute CSV range (from valid rows only — S-8)
  const csvRange = computeCsvRange(validRows)!;

  // Step 7: Detect intra-CSV overlaps (S-6) — these rows ARE inserted but flagged
  const overlapConflicts = detectIntraCSVOverlaps(validRows);
  // Build a map: rowIndex → conflicting rowIndex (for note building)
  const overlapNoteMap = new Map<number, number>();
  for (const c of overlapConflicts) {
    if (!overlapNoteMap.has(c.rowA)) overlapNoteMap.set(c.rowA, c.rowB);
    if (!overlapNoteMap.has(c.rowB)) overlapNoteMap.set(c.rowB, c.rowA);
  }

  // Step 8: Detect duplicate rows (S-7) — these rows are SKIPPED
  const duplicates    = detectDuplicateRows(validRows);
  const duplicateRows = new Set(duplicates.map((d) => d.duplicateRow));

  for (const d of duplicates) {
    const raw = rows[d.duplicateRow - 1];
    skippedRows.push({
      row:        d.duplicateRow,
      employeeId: raw.employeeId,
      projectId:  raw.projectId,
      startDate:  raw.startDate,
      endDate:    raw.endDate,
      reason:     `Duplicate row — same employee, project, and start date as row ${d.originalRow}. Only the first occurrence was imported.`,
    });
  }

  // Rows to actually insert (valid, non-duplicate)
  const insertRows = validRows.filter((r) => !duplicateRows.has(r.rowIndex));

  // Step 9: Build csvPairs for scoped delete
  const csvPairs = new Set(insertRows.map((r) => buildCsvPairKey(r.userId, r.projectId)));

  // Step 10: Retire previous current batch and create new one
  await prisma.allocationBatch.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

  const batch = await prisma.allocationBatch.create({
    data: { label, sourceFile, isCurrent: true, uploadedById: session.user.id },
  });

  // Step 11: Scoped delete — only delete batch allocations for (userId, projectId) pairs
  // that are present in this CSV, within the CSV's date range (S-2, S-4 safety)
  const existingInRange = await prisma.allocation.findMany({
    where: {
      batchId:   { not: null },
      startDate: { lte: csvRange.maxEnd },
      endDate:   { gte: csvRange.minStart },
    },
    select: { id: true, userId: true, projectId: true, hoursPerDay: true },
  });

  // Filter to csvPairs scope and build % change detection map
  const toDelete:         string[]                     = [];
  const oldHoursMap = new Map<string, number>(); // "userId::projectId::startDate" → old hoursPerDay
  // Actually we need to map by pair for % change detection
  const pairOldHours = new Map<string, number>(); // "userId::projectId" → old hoursPerDay (last seen)

  for (const existing of existingInRange) {
    const key = buildCsvPairKey(existing.userId, existing.projectId);
    if (!csvPairs.has(key)) continue;
    toDelete.push(existing.id);
    pairOldHours.set(key, existing.hoursPerDay);
  }

  let deletedCount = 0;
  if (toDelete.length > 0) {
    const result = await prisma.allocation.deleteMany({ where: { id: { in: toDelete } } });
    deletedCount = result.count;
  }

  // Step 12: Insert rows
  let created = 0;
  const importDate = new Date();

  // Step 12: Also detect manual allocation key conflicts (S-12) before inserting
  const manualConflicts = await prisma.allocation.findMany({
    where: {
      batchId:   null,
      userId:    { in: insertRows.map((r) => r.userId) },
      startDate: { in: insertRows.map((r) => r.start) },
    },
    select: { userId: true, projectId: true, startDate: true },
  });
  const manualConflictKeys = new Set(
    manualConflicts.map((m) => `${m.userId}::${m.projectId}::${m.startDate.toISOString()}`)
  );

  for (const row of insertRows) {
    const pairKey      = buildCsvPairKey(row.userId, row.projectId);
    const manualKey    = `${row.userId}::${row.projectId}::${row.start.toISOString()}`;
    let   notes: string | undefined;

    // S-12: manual allocation holds same unique key
    if (manualConflictKeys.has(manualKey)) {
      skippedRows.push({
        row:        row.rowIndex,
        employeeId: row.employeeId,
        projectId:  row.extProjectId,
        startDate:  row.start.toISOString(),
        endDate:    row.end.toISOString(),
        reason:     `Skipped — a manual allocation with the same employee, project, and start date already exists. Delete the manual allocation first if you want this import row to take effect.`,
      });
      continue;
    }

    // S-9: % changed note
    const oldHours = pairOldHours.get(pairKey);
    if (oldHours !== undefined && oldHours !== row.hoursPerDay) {
      notes = buildPercentChangeNote(oldHours, row.hoursPerDay, importDate);
    }

    // S-6: overlap note (appended after % change note if both apply)
    const conflictingRow = overlapNoteMap.get(row.rowIndex);
    if (conflictingRow !== undefined) {
      const overlapNote = buildOverlapNote(conflictingRow);
      notes = notes ? `${notes} | ${overlapNote}` : overlapNote;
    }

    try {
      await prisma.allocation.create({
        data: {
          userId:     row.userId,
          projectId:  row.projectId,
          startDate:  row.start,
          endDate:    row.end,
          hoursPerDay: row.hoursPerDay,
          batchId:    batch.id,
          notes:      notes ?? null,
        },
      });
      created++;
    } catch (e) {
      skippedRows.push({
        row:        row.rowIndex,
        employeeId: row.employeeId,
        projectId:  row.extProjectId,
        startDate:  row.start.toISOString(),
        endDate:    row.end.toISOString(),
        reason:     `Insert failed: ${String(e)}`,
      });
    }
  }

  // Step 13: Store enriched log on the batch record
  try {
    const log = {
      uploadedBy:           session.user.name ?? session.user.email ?? session.user.id,
      uploadedAt:           importDate.toISOString(),
      totalRows:            rows.length,
      allocationsCreated:   created,
      allocationsUpdated:   0,         // kept for UI backward compat
      allocationsDeleted:   deletedCount,
      employeesAutoCreated,
      projectsAutoCreated,
      overlapFlags:         overlapConflicts,
      skippedRows,
      errors:               skippedRows.map((s) => ({ row: s.row, message: s.reason })), // backward compat
      csvRange: {
        minStart: csvRange.minStart.toISOString(),
        maxEnd:   csvRange.maxEnd.toISOString(),
      },
    };
    await prisma.allocationBatch.update({ where: { id: batch.id }, data: { log } });
  } catch {
    // Log save failed — import still succeeds
  }

  // Step 14: Update managerId from Director ID column
  const managerVotes = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.directorId || !row.employeeId) continue;
    if (!managerVotes.has(row.employeeId)) managerVotes.set(row.employeeId, new Map());
    const votes = managerVotes.get(row.employeeId)!;
    votes.set(row.directorId, (votes.get(row.directorId) ?? 0) + 1);
  }
  for (const [employeeExtId, votes] of managerVotes) {
    const userId = userMap.get(employeeExtId);
    if (!userId) continue;
    const topDirectorExtId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const managerUserId    = topDirectorExtId ? userMap.get(topDirectorExtId) : undefined;
    if (managerUserId && managerUserId !== userId) {
      try { await prisma.user.update({ where: { id: userId }, data: { managerId: managerUserId } }); }
      catch { /* non-critical */ }
    }
  }

  revalidateTag("allocations", "max" as never);
  revalidateTag("users",       "max" as never);
  revalidateTag("projects",    "max" as never);

  return ok({
    batchId:              batch.id,
    label:                batch.label,
    created,
    updated:              0,           // backward compat
    deleted:              deletedCount,
    overlapsDetected:     overlapConflicts.length,
    skippedRows,
    employeesAutoCreated,
    projectsAutoCreated,
    errors:               skippedRows.map((s) => ({ row: s.row, message: s.reason })),
    csvRange: {
      minStart: csvRange.minStart.toISOString(),
      maxEnd:   csvRange.maxEnd.toISOString(),
    },
  });
}

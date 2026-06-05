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

  const year  = parseInt(yrStr) < 100 ? 2000 + parseInt(yrStr) : parseInt(yrStr);
  const day   = dayStr.padStart(2, "0");
  const d     = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

// POST /api/import/allocations
// Body: {
//   label:      string;            // batch label e.g. "Initial Import — 5 Jun 2026"
//   sourceFile: string;            // original filename
//   rows: Array<{
//     employeeId:  string;         // FomsId / externalId on User
//     projectId:   string;         // RM ProjectID / externalId on Project
//     allocation:  number;         // Allocation % (0–100)
//     startDate:   string;         // "d-Mon-YY"
//     endDate:     string;         // "d-Mon-YY"
//   }>
// }
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { label, sourceFile, rows, dryRun = false } = body as {
    label:      string;
    sourceFile: string;
    dryRun?:    boolean;
    rows: Array<{
      employeeId: string;
      projectId:  string;
      allocation: number;
      startDate:  string;
      endDate:    string;
    }>;
  };

  if (!label)                              return err("label is required");
  if (!sourceFile)                         return err("sourceFile is required");
  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  let wouldCreate = 0;
  let wouldUpdate = 0;
  const errors: { row: number; message: string }[] = [];

  // Pre-build lookup maps to avoid N+1 queries
  const allUsers    = await prisma.user.findMany({ where: { externalId: { not: null } }, select: { id: true, externalId: true } });
  const allProjects = await prisma.project.findMany({ where: { externalId: { not: null } }, select: { id: true, externalId: true } });
  const userMap     = new Map(allUsers.map((u) => [u.externalId!, u.id]));
  const projectMap  = new Map(allProjects.map((p) => [p.externalId!, p.id]));

  type ValidRow = { userId: string; projectId: string; start: Date; end: Date; hoursPerDay: number };
  const validRows: ValidRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { employeeId, projectId, allocation, startDate, endDate } = rows[i];

    const userId    = userMap.get(employeeId);
    const projDbId  = projectMap.get(projectId);
    const start     = parseRMDate(startDate);
    const end       = parseRMDate(endDate);

    if (!userId)   { errors.push({ row: i + 1, message: `Employee not found: externalId=${employeeId}` }); continue; }
    if (!projDbId) { errors.push({ row: i + 1, message: `Project not found: externalId=${projectId}` });   continue; }
    if (!start || !end) { errors.push({ row: i + 1, message: `Invalid dates: start="${startDate}" end="${endDate}"` }); continue; }

    const hoursPerDay = Math.round(((allocation / 100) * 8) * 100) / 100;
    validRows.push({ userId, projectId: projDbId, start, end, hoursPerDay });
  }

  // For dry-run, check create vs update counts without writing
  if (dryRun) {
    for (const r of validRows) {
      const exists = await prisma.allocation.findUnique({
        where: { userId_projectId_startDate: { userId: r.userId, projectId: r.projectId, startDate: r.start } },
        select: { id: true },
      });
      if (exists) wouldUpdate++; else wouldCreate++;
    }
    return ok({ dryRun: true, wouldCreate, wouldUpdate, errors });
  }

  // Real import — create batch and write allocations
  await prisma.allocationBatch.updateMany({
    where: { isCurrent: true },
    data:  { isCurrent: false },
  });

  const batch = await prisma.allocationBatch.create({
    data: { label, sourceFile, isCurrent: true, uploadedById: session.user.id },
  });

  let created = 0;
  const writeErrors: { row: number; message: string }[] = [];

  for (const r of validRows) {
    try {
      const existing = await prisma.allocation.findUnique({
        where: { userId_projectId_startDate: { userId: r.userId, projectId: r.projectId, startDate: r.start } },
        select: { id: true },
      });
      if (existing) {
        await prisma.allocation.update({
          where: { id: existing.id },
          data:  { endDate: r.end, hoursPerDay: r.hoursPerDay, batchId: batch.id },
        });
      } else {
        await prisma.allocation.create({
          data: { userId: r.userId, projectId: r.projectId, startDate: r.start, endDate: r.end, hoursPerDay: r.hoursPerDay, batchId: batch.id },
        });
      }
      created++;
    } catch (e: unknown) {
      writeErrors.push({ row: validRows.indexOf(r) + 1, message: String(e) });
    }
  }

  revalidateTag("allocations", "max" as never);

  return ok({
    batchId:  batch.id,
    label:    batch.label,
    created,
    skipped:  0,
    errors:   [...errors, ...writeErrors],
  });
}

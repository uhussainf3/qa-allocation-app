import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import { streamImport } from "@/lib/importStream";
import {
  planProjectImport,
  type ProjImportRow,
  type ExistingProject,
  type PMCandidate,
} from "@/lib/projectImportUtils";

const UPDATE_CHUNK_SIZE = 25;
const PM_ROLES = ["PROJECT_MANAGER", "DIVISION_OWNER", "ADMIN"];

// POST /api/import/projects
// Body: { rows: Array<{ projectId, name, status, directorId, pmName?, startDate?, endDate? }> }
//
// All lookups are batch-fetched up front (a handful of queries regardless of
// row count) and the create/update plan is computed in memory via
// planProjectImport — avoids the N+1 query pattern (~5 queries/row) that
// would time out on Vercel for the ~2,500-row Projects File.
//
// Streams ndjson progress events while applying the plan (see streamImport).
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { rows } = body as { rows: ProjImportRow[] };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const directorIds = [...new Set(rows.map((r) => r.directorId).filter(Boolean))];
  const projectIds  = rows.map((r) => r.projectId);
  const codes       = projectIds.map((id) => `P-${id}`);

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so concurrent queries just queue
  // up on the single connection and risk a pool-timeout error.
  const directors = await prisma.user.findMany({
    where:  { externalId: { in: directorIds } },
    select: { id: true, externalId: true },
  });
  const pmUsers = await prisma.user.findMany({
    where:  { isActive: true, role: { in: PM_ROLES } },
    select: { id: true, name: true },
  });
  const existingProjects = await prisma.project.findMany({
    where:  { OR: [{ externalId: { in: projectIds } }, { code: { in: codes } }] },
    select: { id: true, externalId: true, code: true, divisionId: true, startDate: true, endDate: true },
  });

  const divisions = directors.length
    ? await prisma.division.findMany({
        where:  { ownerId: { in: directors.map((d) => d.id) } },
        select: { id: true, ownerId: true },
      })
    : [];

  const divisionByOwnerId = new Map(divisions.map((d) => [d.ownerId as string, d.id]));
  const divisionByDirectorId = new Map<string, string>();
  for (const d of directors) {
    const divId = divisionByOwnerId.get(d.id);
    if (divId && d.externalId) divisionByDirectorId.set(d.externalId, divId);
  }

  const pmCandidates: PMCandidate[] = pmUsers.map((u) => ({ id: u.id, name: u.name ?? "" }));

  const existingByExternalId = new Map<string, ExistingProject>();
  const existingByCode       = new Map<string, ExistingProject>();
  for (const p of existingProjects) {
    const rec: ExistingProject = { id: p.id, divisionId: p.divisionId, startDate: p.startDate, endDate: p.endDate };
    if (p.externalId) existingByExternalId.set(p.externalId, rec);
    existingByCode.set(p.code, rec);
  }

  const plan = planProjectImport(rows, {
    divisionByDirectorId,
    pmCandidates,
    existingByExternalId,
    existingByCode,
  });

  return streamImport(async (send) => {
    const errors: { projectId: string; message: string }[] = [];
    const total = plan.projectsToCreate.length + plan.projectsToUpdate.length;
    let done = 0;

    if (plan.projectsToCreate.length > 0) {
      try {
        await prisma.project.createMany({ data: plan.projectsToCreate, skipDuplicates: true });
      } catch (e: unknown) {
        errors.push({ projectId: "(new projects)", message: String(e) });
      }
      done += plan.projectsToCreate.length;
    }
    send({ type: "progress", phase: "Projects", done, total });

    // Sequential, not Promise.all — the Neon connection pool here is
    // configured with connection_limit=1, so issuing many updates
    // concurrently just queues them up and times out waiting for a
    // connection ("Timed out fetching a new connection from the
    // connection pool ... connection limit: 1"). UPDATE_CHUNK_SIZE is
    // kept purely to control how often progress events are sent.
    for (let i = 0; i < plan.projectsToUpdate.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = plan.projectsToUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
      for (const { id, projectId, data } of chunk) {
        try {
          await prisma.project.update({ where: { id }, data });
        } catch (e: unknown) {
          errors.push({ projectId, message: String(e) });
        }
      }
      done += chunk.length;
      send({ type: "progress", phase: "Projects", done, total });
    }

    revalidateTag("projects", "max" as never);

    return { created: plan.created.length, updated: plan.updated.length, errors };
  });
}

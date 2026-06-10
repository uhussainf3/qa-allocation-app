import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";
import {
  planEmployeeImport,
  type EmpImportRow,
  type DirectorInfo,
  type ExistingUser,
} from "@/lib/employeeImportUtils";

const UPDATE_CHUNK_SIZE = 25;

// POST /api/import/employees
// Body: {
//   rows: Array<{ fomsId, name, email, rmRole, position?, dominantDirectorId? }>
// }
// dominantDirectorId: the directorId from RM - Data.csv that appears most for this employee.
//
// All lookups are batch-fetched up front (a handful of queries regardless of
// row count) and the create/update plan is computed in memory via
// planEmployeeImport — avoids the N+1 query pattern that timed out on Vercel
// for ~700-row imports.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { rows } = body as { rows: EmpImportRow[] };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const fomsIds = rows.map((r) => r.fomsId);
  const emails = rows.map((r) => r.email);
  const directorExtIds = [...new Set(rows.map((r) => r.dominantDirectorId).filter((d): d is string => !!d))];
  const positions = [...new Set(rows.map((r) => r.position).filter((p): p is string => !!p))];

  const [existingByExtId, existingByEmail, directors, existingJobTitles] = await Promise.all([
    prisma.user.findMany({
      where: { externalId: { in: fomsIds } },
      select: { id: true, role: true, divisionId: true, managerId: true, externalId: true },
    }),
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, role: true, divisionId: true, managerId: true, externalId: true, email: true },
    }),
    prisma.user.findMany({
      where: { externalId: { in: directorExtIds } },
      select: { id: true, externalId: true },
    }),
    prisma.jobTitle.findMany({
      where: { name: { in: positions } },
      select: { name: true },
    }),
  ]);

  const divisions = directors.length
    ? await prisma.division.findMany({
        where: { ownerId: { in: directors.map((d) => d.id) } },
        select: { id: true, ownerId: true },
      })
    : [];

  const divisionByOwnerId = new Map(divisions.map((d) => [d.ownerId as string, d.id]));
  const directorsByExternalId = new Map<string, DirectorInfo>(
    directors.map((d) => [d.externalId as string, { id: d.id, divisionId: divisionByOwnerId.get(d.id) ?? null }])
  );
  const usersByExternalId = new Map<string, ExistingUser>(
    existingByExtId.map((u) => [u.externalId as string, u])
  );
  const usersByEmail = new Map<string, ExistingUser>(
    existingByEmail.map((u) => [u.email as string, u])
  );
  const existingJobTitleSet = new Set(existingJobTitles.map((j) => j.name));

  const plan = planEmployeeImport(rows, {
    directorsByExternalId,
    usersByExternalId,
    usersByEmail,
    existingJobTitles: existingJobTitleSet,
  });

  const errors: { fomsId: string; message: string }[] = [];

  if (plan.jobTitlesToCreate.length > 0) {
    try {
      await prisma.jobTitle.createMany({
        data: plan.jobTitlesToCreate.map((name) => ({ name })),
        skipDuplicates: true,
      });
    } catch (e: unknown) {
      errors.push({ fomsId: "(job titles)", message: String(e) });
    }
  }

  if (plan.usersToCreate.length > 0) {
    try {
      await prisma.user.createMany({ data: plan.usersToCreate, skipDuplicates: true });
    } catch (e: unknown) {
      errors.push({ fomsId: "(new employees)", message: String(e) });
    }
  }

  for (let i = 0; i < plan.usersToUpdate.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = plan.usersToUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
    await Promise.all(
      chunk.map(({ id, fomsId, data }) =>
        prisma.user.update({ where: { id }, data }).catch((e: unknown) => {
          errors.push({ fomsId, message: String(e) });
        })
      )
    );
  }

  revalidateTag("users",      "max" as never);
  revalidateTag("job-titles", "max" as never);

  return ok({ created: plan.created.length, skipped: plan.skipped.length, errors });
}

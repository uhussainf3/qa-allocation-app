import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// Derive app role from the RM tool's coarse role column.
// jobTitle is taken directly from the Position column — stored as-is.
function mapRole(rmRole: string): { role: string } {
  switch (rmRole.trim().toLowerCase()) {
    case "pm": return { role: "PROJECT_MANAGER" };
    default:   return { role: "MEMBER" };
  }
}

// Map RM Role column → readable department label stored on User.department
function mapDepartment(rmRole: string): string | null {
  switch (rmRole.trim().toLowerCase()) {
    case "dev":
    case "ui":            return "Developer";
    case "qa":            return "QA Engineer";
    case "pm":            return "Project Manager";
    case "fc":            return "Functional Consultant";
    case "product manager": return "Product Manager";
    default:              return null;
  }
}

// POST /api/import/employees
// Body: {
//   rows: Array<{ fomsId, name, email, rmRole, dominantDirectorId? }>
// }
// dominantDirectorId: the directorId from RM - Data.csv that appears most for this employee.
// Skip rows where fomsId already exists as externalId (directors from Step 2).
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { rows } = body as {
    rows: Array<{
      fomsId:              string;
      name:                string;
      email:               string;
      rmRole:              string;
      position?:           string;
      dominantDirectorId?: string;
    }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const created: string[] = [];
  const skipped: string[] = [];
  const errors:  { fomsId: string; message: string }[] = [];

  for (const row of rows) {
    const { fomsId, name, email, rmRole, position = "", dominantDirectorId } = row;

    try {
      // Skip directors already imported in Step 2 — but backfill jobTitle if missing
      const existingByExtId = await prisma.user.findFirst({ where: { externalId: fomsId } });
      if (existingByExtId) {
        const updates: Record<string, string> = {};
        if (!existingByExtId.jobTitle  && position)            updates.jobTitle   = position;
        if (!existingByExtId.department && mapDepartment(rmRole)) updates.department = mapDepartment(rmRole)!;
        if (Object.keys(updates).length)
          await prisma.user.update({ where: { id: existingByExtId.id }, data: updates });
        skipped.push(fomsId);
        continue;
      }

      const { role }   = mapRole(rmRole);
      const jobTitle   = position || null;
      const department = mapDepartment(rmRole);

      // Resolve division from dominant director
      let divisionId: string | null = null;
      if (dominantDirectorId) {
        const director = await prisma.user.findFirst({ where: { externalId: dominantDirectorId } });
        if (director) {
          const div = await prisma.division.findFirst({ where: { ownerId: director.id } });
          divisionId = div?.id ?? null;
        }
      }

      // Upsert by email (in case user already registered via Google OAuth)
      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            externalId: fomsId,
            role:       existing.role === "ADMIN" ? existing.role : role,
            jobTitle:   existing.jobTitle ?? jobTitle,
            department: existing.department ?? department,
            divisionId: existing.divisionId ?? divisionId,
          },
        });
        skipped.push(fomsId);
      } else {
        await prisma.user.create({
          data: {
            name,
            email,
            role,
            jobTitle,
            department,
            externalId: fomsId,
            divisionId,
            isActive:   true,
            capacity:   40,
          },
        });
        created.push(name);
      }
    } catch (e: unknown) {
      errors.push({ fomsId, message: String(e) });
    }
  }

  revalidateTag("users", "max" as never);

  return ok({ created: created.length, skipped: skipped.length, errors });
}

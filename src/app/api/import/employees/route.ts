import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

function mapRole(rmRole: string): { role: string; jobTitle: string | null } {
  switch (rmRole.trim().toLowerCase()) {
    case "dev":
    case "ui":
      return { role: "MEMBER", jobTitle: "DEVELOPER" };
    case "qa":
      return { role: "MEMBER", jobTitle: "QA_ENGINEER" };
    case "pm":
      return { role: "PROJECT_MANAGER", jobTitle: "PROJECT_MANAGER" };
    case "fc":
      return { role: "MEMBER", jobTitle: "FUNCTIONAL_CONSULTANT" };
    case "product manager":
      return { role: "MEMBER", jobTitle: "PRODUCT_MANAGER" };
    default:
      return { role: "MEMBER", jobTitle: null };
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
      fomsId:             string;
      name:               string;
      email:              string;
      rmRole:             string;
      dominantDirectorId?: string;
    }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const created: string[] = [];
  const skipped: string[] = [];
  const errors:  { fomsId: string; message: string }[] = [];

  for (const row of rows) {
    const { fomsId, name, email, rmRole, dominantDirectorId } = row;

    try {
      // Skip directors already imported in Step 2
      const existingByExtId = await prisma.user.findFirst({ where: { externalId: fomsId } });
      if (existingByExtId) {
        skipped.push(fomsId);
        continue;
      }

      const { role, jobTitle } = mapRole(rmRole);

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
            jobTitle:   jobTitle ?? existing.jobTitle,
            divisionId: existing.divisionId ?? divisionId,
          },
        });
        skipped.push(fomsId); // exists but updated
      } else {
        await prisma.user.create({
          data: {
            name,
            email,
            role,
            jobTitle,
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

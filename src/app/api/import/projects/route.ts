import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

function parseProjectDate(raw: string | undefined): Date | null {
  if (!raw || raw.trim() === "") return null;
  // Format: YYYY.MM.DD
  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function mapStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "active" || s === "on demand") return "ACTIVE";
  if (s === "close" || s === "closed" || s === "completed") return "COMPLETED";
  return "ACTIVE";
}

// POST /api/import/projects
// Body: { rows: Array<{ projectId, name, status, directorId, startDate?, endDate? }> }
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { rows } = body as {
    rows: Array<{
      projectId:  string;
      name:       string;
      status:     string;
      directorId: string;
      startDate?: string;
      endDate?:   string;
    }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const created: string[] = [];
  const updated: string[] = [];
  const errors: { projectId: string; message: string }[] = [];

  for (const row of rows) {
    const { projectId, name, status, directorId, startDate, endDate } = row;

    try {
      // Find the division via the director's externalId
      const directorUser = await prisma.user.findFirst({ where: { externalId: directorId } });
      const division = directorUser
        ? await prisma.division.findFirst({ where: { ownerId: directorUser.id } })
        : null;

      const code      = `P-${projectId}`;
      const appStatus = mapStatus(status);
      const start     = parseProjectDate(startDate);
      const end       = parseProjectDate(endDate);

      const existing = await prisma.project.findFirst({
        where: { OR: [{ externalId: projectId }, { code }] },
      });

      if (existing) {
        await prisma.project.update({
          where: { id: existing.id },
          data:  {
            name,
            status:     appStatus,
            divisionId: division?.id ?? existing.divisionId,
            externalId: projectId,
            startDate:  start ?? existing.startDate,
            endDate:    end   ?? existing.endDate,
          },
        });
        updated.push(name);
      } else {
        await prisma.project.create({
          data: {
            name,
            code,
            status:     appStatus,
            divisionId: division?.id ?? null,
            externalId: projectId,
            startDate:  start ?? undefined,
            endDate:    end   ?? undefined,
          },
        });
        created.push(name);
      }
    } catch (e: unknown) {
      errors.push({ projectId, message: String(e) });
    }
  }

  revalidateTag("projects", "max" as never);

  return ok({ created: created.length, updated: updated.length, errors });
}

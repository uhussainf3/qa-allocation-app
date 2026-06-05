import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

// Division name overrides from IMPORT_PLAN.md
const DIVISION_NAME_MAP: Record<string, string> = {
  "113": "Dynamics",
  "14":  "NetSuite",
  "226": "Shahzad Anees Division",
  "144": "Muhammad Abdullah Division",
  "304": "Ather Sultan Division",
};

// Director name fallbacks for IDs not in the map
const DIRECTOR_NAME_MAP: Record<string, string> = {
  "113": "Dynamics",
  "14":  "NetSuite",
  "226": "Shahzad Anees Division",
  "144": "Muhammad Abdullah Division",
  "304": "Ather Sultan Division",
};

function divisionNameForDirector(directorId: string, directorName: string): string {
  if (DIVISION_NAME_MAP[directorId]) return DIVISION_NAME_MAP[directorId];
  // Special-case known names from IMPORT_PLAN.md
  if (directorName.toLowerCase().includes("aneeq")) return "AI/ML & DATA";
  if (directorName.toLowerCase().includes("hamza")) return "App Dev";
  if (directorName.toLowerCase().includes("faisal")) return "ECommerce";
  return `${directorName} Division`;
}

function divisionCode(name: string): string {
  // Make a short uppercase code from the first letters of each word, max 6 chars
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 6).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().substring(0, 6);
}

// POST /api/import/divisions
// Body: { rows: Array<{ directorId: string; directorName: string; email: string }> }
// Each row is a unique director from Employee_RM.csv cross-referenced with Projects File.csv.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return unauthorized();
  if (session.user.role !== "ADMIN") return err("Forbidden", 403);

  const body = await req.json();
  const { rows } = body as {
    rows: Array<{ directorId: string; directorName: string; email: string }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) return err("rows must be a non-empty array");

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: { directorId: string; message: string }[] = [];

  for (const row of rows) {
    const { directorId, directorName, email } = row;

    try {
      // Upsert the division owner user
      let user = await prisma.user.findFirst({
        where: { OR: [{ externalId: directorId }, { email }] },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name:       directorName,
            email:      email || `director-${directorId}@import.local`,
            role:       "DIVISION_OWNER",
            jobTitle:   "PROJECT_MANAGER",
            externalId: directorId,
            isActive:   true,
            capacity:   40,
          },
        });
      } else if (!user.externalId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data:  { externalId: directorId, role: "DIVISION_OWNER" },
        });
      }

      // Upsert the division
      const name = divisionNameForDirector(directorId, directorName);
      let code = divisionCode(name);

      // Ensure code uniqueness by appending directorId suffix if needed
      const existing = await prisma.division.findUnique({ where: { code } });
      if (existing && existing.ownerId !== user.id) {
        code = `${code}${directorId}`.substring(0, 8).toUpperCase();
      }

      const division = await prisma.division.upsert({
        where:  { code },
        update: { name, ownerId: user.id },
        create: {
          name,
          code,
          ownerId:  user.id,
          isActive: true,
        },
      });

      // Assign division to the owner user if not already set
      if (!user.divisionId) {
        await prisma.user.update({
          where: { id: user.id },
          data:  { divisionId: division.id },
        });
      }

      created.push(name);
    } catch (e: unknown) {
      errors.push({ directorId, message: String(e) });
    }
  }

  revalidateTag("divisions", "max" as never);
  revalidateTag("users",     "max" as never);

  return ok({ created: created.length, skipped: skipped.length, errors });
}

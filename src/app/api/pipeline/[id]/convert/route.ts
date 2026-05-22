import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/apiResponse";
import { revalidateTag } from "next/cache";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return unauthorized();

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") return forbidden();

  const { id } = await params;
  const item = await prisma.pipeline.findUnique({ where: { id } });
  if (!item) return notFound();
  if (item.convertedProjectId) return err("This deal has already been converted to a project");

  // Auto-generate a unique project code from the deal name
  const base    = item.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(3, "X");
  const suffix  = Date.now().toString(36).slice(-3).toUpperCase();
  const code    = `${base}-${suffix}`;

  // Pick a colour from a small palette
  const COLORS  = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
  const color   = COLORS[Math.floor(Math.random() * COLORS.length)];

  const project = await prisma.project.create({
    data: {
      name:        item.name,
      code,
      clientName:  item.clientName,
      status:      "ACTIVE",
      startDate:   item.expectedStartDate,
      endDate:     item.expectedEndDate,
      color,
    },
  });

  // Mark the pipeline item as converted + WON
  await prisma.pipeline.update({
    where: { id },
    data:  { convertedProjectId: project.id, status: "WON" },
  });

  revalidateTag("pipeline", "max");
  revalidateTag("projects",  "max");

  return ok({ project: { id: project.id, name: project.name, code: project.code } }, 201);
}

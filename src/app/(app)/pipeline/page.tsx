import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PipelineClient } from "./PipelineClient";
import type { Role } from "@/types/enums";

export default async function PipelinePage() {
  const session = await auth();

  const items = await prisma.pipeline.findMany({
    orderBy: [{ status: "asc" }, { probability: "desc" }, { createdAt: "desc" }],
  });

  return (
    <PipelineClient
      initialItems={items.map((p) => ({
        ...p,
        expectedStartDate: p.expectedStartDate?.toISOString() ?? null,
        expectedEndDate:   p.expectedEndDate?.toISOString()   ?? null,
        createdAt:         p.createdAt.toISOString(),
        updatedAt:         p.updatedAt.toISOString(),
      }))}
      currentUserRole={session!.user.role as Role}
    />
  );
}

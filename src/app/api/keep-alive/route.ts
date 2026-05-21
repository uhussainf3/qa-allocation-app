import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Called by Vercel Cron every 4 minutes to keep Neon database warm
export async function GET(req: Request) {
  // Verify it's coming from Vercel Cron (not a random visitor)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const ms = Date.now() - start;

  return NextResponse.json({ ok: true, db_ms: ms, ts: new Date().toISOString() });
}

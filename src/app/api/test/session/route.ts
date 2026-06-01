/**
 * DEV / TEST ONLY — never reachable in production.
 * Creates a real database session for a given email so Playwright
 * can test authenticated flows without going through Google OAuth.
 */
import { prisma } from "@/lib/prisma";
import { err } from "@/lib/apiResponse";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return err("Not found", 404);
  }

  const { email } = await req.json();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return err("User not found", 404);

  const sessionToken = randomBytes(32).toString("hex");
  const expires      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    expires,
  });
  return res;
}

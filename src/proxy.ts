import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canViewExecutiveDashboard } from "@/lib/accessUtils";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — no auth needed
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    // dev-only test helpers — never whitelisted in production
    (pathname.startsWith("/api/test") && process.env.NODE_ENV !== "production")
  ) {
    return NextResponse.next();
  }

  // Not logged in → redirect to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth.user?.role;
  const jobTitle = req.auth.user?.jobTitle;

  // Admin-only pages
  if (
    (pathname.startsWith("/divisions") || pathname.startsWith("/team") || pathname.startsWith("/import") || pathname.startsWith("/settings")) &&
    role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Executive Dashboard — ADMIN + EXECUTIVE, or any user with jobTitle "VP"
  if (pathname.startsWith("/dashboard") && !canViewExecutiveDashboard(role ?? "MEMBER", jobTitle)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

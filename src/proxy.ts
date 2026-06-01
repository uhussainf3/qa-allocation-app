import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

  // Admin-only routes
  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Management + Admin dashboards only
  if (
    pathname.startsWith("/dashboard") &&
    role !== "ADMIN" &&
    role !== "MANAGEMENT" &&
    role !== "PROJECT_MANAGER"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

import { NextResponse } from "next/server";

export function proxy(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/signup") ||
    pathname.startsWith("/api/reset") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }
  // Το cookie πρέπει να υπάρχει· η υπογραφή και η έκδοσή του ελέγχονται στα API.
  const session = req.cookies.get("__Host-turno_session")?.value;
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

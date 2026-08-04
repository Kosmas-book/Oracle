import { NextResponse } from "next/server";

export function middleware(req) {
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
  // Το cookie πρέπει να υπάρχει· η εγκυρότητά του ελέγχεται στα API routes
  // (αντιστοίχιση PIN → κατάστημα στη βάση).
  const pin = req.cookies.get("vardia_pin")?.value;
  if (pin) return NextResponse.next();
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

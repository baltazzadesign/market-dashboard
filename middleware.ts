import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PASSWORD = "balta260427";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const access = req.cookies.get("access")?.value;

  if (access === PASSWORD) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
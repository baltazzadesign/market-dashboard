import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { accessCode } from "@/lib/balta-access";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const access = req.cookies.get("access")?.value;

  if (access === accessCode()) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
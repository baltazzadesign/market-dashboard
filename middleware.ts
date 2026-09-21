import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { accessCode } from "@/lib/balta-access";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API와 로그인 페이지는 통과
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const access = req.cookies.get("access")?.value;

  if (access === accessCode()) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
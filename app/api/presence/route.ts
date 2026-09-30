import { NextResponse } from "next/server";
import { hasDashboardAccess, sameOrigin } from "@/lib/balta-access";
import { heartbeatPresence, presenceConfig, presenceVisitor, PresenceError, PRESENCE_COOKIE, PRESENCE_INTERVAL_SECONDS, PRESENCE_WINDOW_SECONDS } from "@/lib/online-presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ ok: false, count: null, error: "FORBIDDEN" }, { status: 403, headers });
  if (!hasDashboardAccess(request)) return NextResponse.json({ ok: false, count: null, error: "UNAUTHORIZED" }, { status: 401, headers });
  let token: string | undefined;
  let response: NextResponse;
  try {
    const config = presenceConfig();
    const visitor = presenceVisitor(request.headers.get("cookie") ?? "", config.key);
    token = visitor.token;
    const data = await heartbeatPresence(visitor.id, config, request.signal);
    response = NextResponse.json({ ok: true, ...data, windowSeconds: PRESENCE_WINDOW_SECONDS, refreshSeconds: PRESENCE_INTERVAL_SECONDS }, { headers });
  } catch (error) {
    const code = error instanceof PresenceError ? error.code : "PRESENCE_UNAVAILABLE";
    // Count failure must never display a fabricated zero or expose DB credentials.
    response = NextResponse.json({ ok: false, count: null, error: code }, { status: 503, headers });
  }
  if (token) response.cookies.set(PRESENCE_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400,
  });
  return response;
}

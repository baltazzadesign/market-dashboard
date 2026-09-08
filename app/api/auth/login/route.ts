import { NextResponse } from "next/server";
import { accessCode, sameOrigin } from "@/lib/balta-access";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "요청 출처를 확인해 주세요." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.code !== "string" || body.code !== accessCode())
      return NextResponse.json({ ok: false, error: "접근 코드가 일치하지 않습니다." }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("access", accessCode(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400 });
    return response;
  } catch { return NextResponse.json({ ok: false, error: "접근 코드를 다시 입력해 주세요." }, { status: 400 }); }
}

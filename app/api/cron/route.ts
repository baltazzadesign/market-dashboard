import { NextResponse } from "next/server";

export async function GET() {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "https://baltatool.com";

    const res = await fetch(`${baseUrl}/api/market/live`, {
      cache: "no-store",
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "cron 실행 실패", detail: e.message },
      { status: 500 }
    );
  }
}
// force deploy
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/market/live`
    );

    const data = await res.json();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "cron 실행 실패", detail: e.message },
      { status: 500 }
    );
  }
}
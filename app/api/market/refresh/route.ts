import { GET as collectMarket } from "../live/route";
import { hasDashboardAccess, sameOrigin } from "@/lib/balta-access";
import { kstParts, record } from "@/lib/balta-model";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
let pending: Promise<{ body: Record<string, unknown>; status: number }> | null = null;
let cached: { body: Record<string, unknown>; status: number; at: number } | null = null;
export async function POST(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ ok: false, error: "요청 출처를 확인해 주세요." }, { status: 403 });
  if (cached && Date.now() - cached.at < 30000) return Response.json(cached.body, { status: cached.status });
  if (!pending) {
    pending = (async () => {
      try {
        const headers = new Headers();
        if (process.env.CRON_SECRET) headers.set("authorization", "Bearer " + process.env.CRON_SECRET);
        const response = await collectMarket(new Request(new URL("/api/market/live", request.url), { headers }));
        const body = record(await response.json());
        if (!response.ok || body.ok === false || body.error) return { body: { ok: false, error: "실시간 수집에 실패했습니다. 저장된 기록을 표시합니다." }, status: 502 };
        const now = kstParts();
        const result = { body: { ...body, time: body.time ?? now.time, date: typeof body.createdat === "string" ? body.createdat : now.date }, status: 200 };
        cached = { ...result, at: Date.now() };
        return result;
      } catch { return { body: { ok: false, error: "실시간 수집이 지연되고 있습니다. 저장된 기록을 표시합니다." }, status: 502 }; }
    })();
  }
  const task = pending;
  try { const result = await task; return Response.json(result.body, { status: result.status }); }
  finally { if (pending === task) pending = null; }
}

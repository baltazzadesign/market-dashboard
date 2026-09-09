import { marketClosedReason, parseAdditionalHolidays } from "./market-calendar";
import { isValidDate, kstParts, normalizeRows, type MarketRow } from "./balta-model";
export class MarketDataError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
export async function readMarketDay(date: string, signal?: AbortSignal): Promise<MarketRow[]> {
  if (!isValidDate(date)) throw new MarketDataError("날짜 형식이 올바르지 않습니다.", 400);
  if (marketClosedReason(date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS))) return [];
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new MarketDataError("저장 데이터 연결 설정을 확인해 주세요.", 503);
  // Use the collector's KST trade date, not insertion timestamp (late imports differ).
  const all: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const query = new URLSearchParams({ select: "*", createdat: "eq." + date, order: "id.desc", limit: "500", offset: String(offset) });
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
    const response = await fetch(url.replace(/\/$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/logs?" + query.toString(), {
      headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" },
      cache: "no-store", signal: combined,
    });
    if (!response.ok) throw new MarketDataError("저장 데이터를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
    const values: unknown = await response.json();
    if (!Array.isArray(values)) throw new MarketDataError("저장 데이터 응답 형식을 확인해 주세요.", 502);
    all.push(...values);
    if (values.length < 500) break;
    if (offset >= 100000) throw new MarketDataError("하루 기록 수가 너무 많습니다. 중복 수집 설정을 확인해 주세요.", 502);
  }
  return normalizeRows(all, date);
}
export function requestedDate(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || kstParts().date;
  if (!isValidDate(date)) throw new MarketDataError("날짜 형식이 올바르지 않습니다.", 400);
  return date;
}
export function marketError(error: unknown) {
  return Response.json({ ok: false, error: error instanceof MarketDataError ? error.message : "데이터 조회가 지연되고 있습니다. 다시 시도해 주세요." },
    { status: error instanceof MarketDataError ? error.status : 502 });
}

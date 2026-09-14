import { hasDashboardAccess } from "@/lib/balta-access";
import { readRawMarketDay, requestedDate, marketError } from "@/lib/balta-data";
import { normalizeRows, normalizeRow, kstParts, minuteLabel, OPEN_MINUTE, CLOSE_MINUTE } from "@/lib/balta-model";
import { marketClosedReason, parseAdditionalHolidays } from "@/lib/market-calendar";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401, headers });
  try {
    const date = requestedDate(request), now = kstParts();
    const closed = marketClosedReason(date, parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
    const raw = await readRawMarketDay(date, request.signal);
    const displayed = normalizeRows(raw, date);
    const byMinute = new Map(displayed.map(row => [row.minute, row]));
    const stored = new Map<number, ReturnType<typeof normalizeRow>[]>();
    for (const value of raw) {
      const row = normalizeRow(value, date);
      if (row.minute < OPEN_MINUTE || row.minute > CLOSE_MINUTE) continue;
      stored.set(row.minute, [...(stored.get(row.minute) ?? []), row]);
    }
    const end = closed || date > now.date ? OPEN_MINUTE - 1 : date === now.date ? Math.min(CLOSE_MINUTE, now.minute - 1) : CLOSE_MINUTE;
    const missing = [], filtered = [], flowUnavailable = [], duplicates = [];
    for (let minute = OPEN_MINUTE; minute <= end; minute++) {
      const time = minuteLabel(minute), rows = stored.get(minute), shown = byMinute.get(minute);
      if (!rows) { missing.push(time); continue; }
      if (rows.length > 1) duplicates.push({ time, count: rows.length });
      if (!shown) {
        filtered.push({ time, reason: "ZERO_BREADTH_WITHOUT_MISSING_MARKER", records: rows.map(row => ({ id: row.id, breadthSource: row.breadthSource, total: row.up + row.down + row.flat })) });
      } else if (shown.foreignFlow === null || shown.instFlow === null || shown.indivFlow === null) {
        flowUnavailable.push({ time, id: shown.id, flowSource: shown.flowSource, foreign: shown.foreignFlow, inst: shown.instFlow, indiv: shown.indivFlow });
      }
    }
    const first = stored.size ? Math.min(...stored.keys()) : null;
    return Response.json({
      ok: true, date, capturedAt: new Date().toISOString(), closed: closed || null,
      checkedThrough: end >= OPEN_MINUTE ? minuteLabel(end) : null,
      summary: { rawRows: raw.length, displayedMinutes: displayed.length, missingMinutes: missing.length, filteredMinutes: filtered.length, flowUnavailableMinutes: flowUnavailable.length },
      firstStoredTime: first === null ? null : minuteLabel(first),
      missingBeforeFirst: missing.filter(time => first !== null && time < minuteLabel(first)),
      missingWithinObservedPeriod: missing.filter(time => first === null || time >= minuteLabel(first)),
      filtered, flowUnavailable, duplicates,
      interpretation: "missing: DB에 해당 분 기록 없음 / filtered: DB 기록은 있지만 화면 필터에서 제외 / flowUnavailable: 표시할 기록은 있지만 수급 값이 결측. 완료된 분만 검사합니다.",
    }, { headers });
  } catch (error) {
    const response = marketError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

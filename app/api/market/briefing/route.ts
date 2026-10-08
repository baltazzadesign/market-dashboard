import { hasDashboardAccess } from '@/lib/balta-access';
import { MarketDataError, readRawMarketDay, requestedDate } from '@/lib/balta-data';
import { kstParts } from '@/lib/balta-model';
import { marketClosedReason, parseAdditionalHolidays } from '@/lib/market-calendar';
import { buildBriefing, briefingDates } from '@/lib/market-briefing';
import { researchRequest } from '@/lib/research-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401, headers });
  try {
    const now = new Date(), today = kstParts(now).date, date = requestedDate(request);
    if (date > today || date < '2000-01-01') throw new MarketDataError('오늘 이전의 유효한 날짜를 선택해 주세요.', 400);
    const holidays = parseAdditionalHolidays(process.env.MARKET_HOLIDAYS), closed = marketClosedReason(date, holidays);
    const dates = briefingDates(today, holidays);
    if (closed) return Response.json({ ...buildBriefing(date, [], [], now, [], closed), dates }, { headers });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(22000)]);
    const query = new URLSearchParams({ select: 'trade_date,market,time,sectors,captured_at', trade_date: 'eq.' + date, order: 'market.asc' });
    const [market, sectors] = await Promise.allSettled([readRawMarketDay(date, signal), researchRequest('market_sector_daily?' + query, signal)]);
    // A failed primary read is an error, never a fabricated empty market day.
    if (market.status === 'rejected') throw new MarketDataError('시장 기록을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.', 503);
    const warnings = sectors.status === 'rejected' ? ['업종 기록을 불러오지 못했습니다. 시장 요약은 조회된 기록으로 표시합니다.'] : [];
    return Response.json({ ...buildBriefing(date, market.value, sectors.status === 'fulfilled' ? sectors.value : [], now, warnings), dates }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof MarketDataError ? error.message : '브리핑 조회가 지연되고 있습니다. 다시 시도해 주세요.' },
      { status: error instanceof MarketDataError ? error.status : 503, headers });
  }
}

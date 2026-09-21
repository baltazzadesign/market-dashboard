import { hasDashboardAccess } from '@/lib/balta-access';
import { readMarketDay, requestedDate, marketError } from '@/lib/balta-data';
import { GET as readSectorSnapshot } from '../sectors/route';
import { calculateMarketPulse } from '@/lib/market-pulse';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const date = requestedDate(request);
    // Reuse the web endpoint's market normalization, deduplication and per-market times.
    const [rows, sectors] = await Promise.all([readMarketDay(date, request.signal), readSectorSnapshot(request).then(async response => response.ok ? await response.json() : null).catch(() => null)]);
    const saved = sectors?.snapshot;
    const snapshot = saved ? { date, time: String(saved.time || ''), sectors: Array.isArray(saved.market_data?.sectors) ? saved.market_data.sectors : [] } : null;
    return Response.json({ ok: true, date, pulse: calculateMarketPulse(rows, snapshot), sectorStatus: sectors === null ? '섹터 조회 실패 · 나머지 지표로 계산' : '' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return marketError(error); }
}

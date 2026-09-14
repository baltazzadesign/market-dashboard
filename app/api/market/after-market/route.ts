import { getKrxMarketStatus, parseAdditionalHolidays } from '@/lib/market-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

async function sb(path: string) {
  const c = config();
  if (!c) throw new Error('SUPABASE_CONFIG_MISSING');

  const res = await fetch(`${c.url}${path}`, {
    headers: { apikey: c.key, authorization: `Bearer ${c.key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`SUPABASE_${res.status}`);
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : null;
}

function minuteOf(value: unknown) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

function sessionOf(row: any) {
  const direct = String(row?.market_data?.session ?? row?.marketData?.session ?? '').trim();
  if (direct) return direct;

  const state = String(row?.marketstate ?? row?.marketState ?? '');
  const marker = state.match(/(?:^|\|)SESSION_([A-Z_]+)(?:\||$)/);
  if (marker?.[1]) return marker[1];

  const minute = minuteOf(row?.time);
  if (minute > 15 * 60 + 30 && minute < 16 * 60) return 'AFTER_HOURS_CLOSE';
  if (minute >= 16 * 60 && minute < 20 * 60) return 'KRX_AFTER_MARKET';
  return '';
}

function isExtendedRow(row: any) {
  const session = sessionOf(row);
  return session === 'AFTER_HOURS_CLOSE' || session === 'KRX_AFTER_MARKET';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const extraHolidays = parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
    const currentStatus = getKrxMarketStatus(new Date(), extraHolidays);
    const requestedDate = url.searchParams.get('date') ?? currentStatus.tradeDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return Response.json(
        { ok: false, error: 'INVALID_DATE' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // 기존 daily API가 정규장 행만 반환하더라도 장후 기록을 잃지 않도록
    // 같은 logs 테이블에서 해당 날짜의 확장 세션 행을 별도로 읽습니다.
    const rawRows = await sb(
      `/rest/v1/logs?select=*&createdat=eq.${encodeURIComponent(requestedDate)}&order=id.asc&limit=1000`,
    );

    const rows = Array.isArray(rawRows)
      ? rawRows.filter(isExtendedRow)
      : [];

    return Response.json(
      {
        ok: true,
        date: requestedDate,
        marketStatus: currentStatus,
        rows,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

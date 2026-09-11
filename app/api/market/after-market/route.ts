import { getKrxMarketStatus, parseAdditionalHolidays } from '@/lib/market-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type HealthRow = {
  connected?: boolean;
  schema_ready?: boolean;
  persistence_enabled?: boolean;
  last_message_at?: string | null;
  last_after_market_at?: string | null;
  last_error?: string | null;
  symbols?: unknown;
  updated_at?: string | null;
};

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
  return res.json();
}

function fresh(ts: string | null | undefined, ms = 75_000) {
  if (!ts) return false;
  const value = new Date(ts).getTime();
  return Number.isFinite(value) && Date.now() - value <= ms;
}

export async function GET() {
  try {
    const extraHolidays = parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
    const marketStatus = getKrxMarketStatus(new Date(), extraHolidays);
    const [healthRows, quoteRows] = await Promise.all([
      sb('/rest/v1/market_session_collector_health?select=*&id=eq.kis_after_market&limit=1'),
      marketStatus.session === 'KRX_AFTER_MARKET'
        ? sb(`/rest/v1/market_session_quotes?select=trade_date,market,symbol,venue,session,observed_at,price,volume,turnover,regular_close,regular_close_verified,source&trade_date=eq.${encodeURIComponent(marketStatus.tradeDate)}&session=eq.KRX_AFTER_MARKET&order=observed_at.desc&limit=200`)
        : Promise.resolve([]),
    ]);

    const health: HealthRow | null = Array.isArray(healthRows) ? healthRows[0] ?? null : null;
    const connected = Boolean(health?.connected) && fresh(health?.updated_at);
    const bySymbol = new Map<string, any>();
    if (Array.isArray(quoteRows)) {
      for (const row of quoteRows) if (row?.symbol && !bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
    }

    const availability = connected && health?.schema_ready && health?.persistence_enabled
      ? 'CONNECTED'
      : connected
        ? 'PROBE_CONNECTED'
        : 'NOT_CONNECTED';

    return Response.json({
      ok: true,
      marketStatus,
      availability,
      collector: health,
      quotes: [...bySymbol.values()],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

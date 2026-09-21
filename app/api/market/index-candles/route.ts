import { hasDashboardAccess } from '@/lib/balta-access';
import { kisTerminal, outputRows } from '@/lib/kis-terminal';
import { finite, type Candle } from '@/lib/terminal-model';
import { isValidDate, kstParts } from '@/lib/balta-model';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const url = new URL(request.url), date = url.searchParams.get('date') || kstParts().date, market = url.searchParams.get('market') || 'kospi', range = url.searchParams.get('range') || '1M';
  if (!isValidDate(date) || date > kstParts().date || !['kospi', 'kosdaq'].includes(market) || !['1W', '1M', '3M', '1Y'].includes(range)) return Response.json({ ok: false, error: '조회 범위를 확인해 주세요.' }, { status: 400 });
  try {
    const body = await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price', 'FHPUP02120000', { FID_PERIOD_DIV_CODE: range === '1Y' ? 'W' : 'D', FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: market === 'kospi' ? '0001' : '1001', FID_INPUT_DATE_1: date.replaceAll('-', '') }, 300_000);
    const candles = outputRows(body.output2).flatMap(r => {
      const open = finite(r.bstp_nmix_oprc), high = finite(r.bstp_nmix_hgpr), low = finite(r.bstp_nmix_lwpr), close = finite(r.bstp_nmix_prpr), time = String(r.stck_bsop_date || '');
      return open && high && low && close && /^\d{8}$/.test(time) ? [{ time: `${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6)}`, open, high, low, close, volume: finite(r.acml_vol) } satisfies Candle] : [];
    }).sort((a, b) => a.time.localeCompare(b.time)).slice(-({ '1W': 5, '1M': 22, '3M': 66, '1Y': 53 }[range] ?? 22));
    return Response.json({ ok: true, candles, asOf: new Date().toISOString(), caption: range === '1Y' ? 'KIS 주봉 · 제공된 기록 범위' : 'KIS 일봉 · 제공된 기록 범위' });
  } catch { return Response.json({ ok: false, candles: [], error: '기간별 지수를 불러오지 못했습니다.' }, { status: 503 }); }
}

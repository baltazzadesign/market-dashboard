import { hasDashboardAccess } from '@/lib/balta-access';
import { kisTerminal, outputRows } from '@/lib/kis-terminal';
import { finite, signedChange, type Quote, type TerminalSnapshot } from '@/lib/terminal-model';
import { FX_PAIRS, currencyIndicators } from '@/lib/terminal-fx';
import { kstParts, moveDate } from '@/lib/balta-model';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const asOf = new Date().toISOString();
  const quotes: Quote[] = [], indicators: Quote[] = [], warnings: string[] = [];
  const jobs = [
    ...[['0001', 'KOSPI'], ['1001', 'KOSDAQ']].map(([code, name]) => (async () => {
      const body = await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-price', 'FHPUP02100000', { FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: code });
      const row = outputRows(body.output)[0] ?? {};
      const q: Quote = { code, name, price: finite(row.bstp_nmix_prpr), change: signedChange(row.bstp_nmix_prdy_vrss, row.prdy_vrss_sign), rate: signedChange(row.bstp_nmix_prdy_ctrt, row.prdy_vrss_sign), volume: finite(row.acml_vol), turnover: finite(row.acml_tr_pbmn), asOf };
      quotes.push(q);
    })()),
    (async () => {
      const body = await kisTerminal('/uapi/domestic-futureoption/v1/quotations/display-board-futures', 'FHPIF05030200', { FID_COND_MRKT_DIV_CODE: 'F', FID_COND_SCR_DIV_CODE: '20503', FID_COND_MRKT_CLS_CODE: process.env.KIS_FUTURES_MARKET || 'MKI' });
      const row = outputRows(body.output).filter(r => finite(r.futs_prpr) !== null && Number(r.futs_prpr) > 0 && (finite(r.hts_rmnn_dynu) ?? -1) >= 0).sort((a, b) => Number(a.hts_rmnn_dynu) - Number(b.hts_rmnn_dynu))[0];
      if (!row) throw new Error('선물 시세 대기');
      quotes.push({ code: String(row.futs_shrn_iscd ?? ''), name: String(row.hts_kor_isnm || '최근월 선물'), price: finite(row.futs_prpr), change: signedChange(row.futs_prdy_vrss, row.prdy_vrss_sign), rate: signedChange(row.futs_prdy_ctrt, row.prdy_vrss_sign), volume: finite(row.acml_vol), turnover: null, asOf });
    })(),
    (async () => {
      const today = kstParts().date;
      const start = moveDate(today, -14).replaceAll('-', ''), end = today.replaceAll('-', '');
      const results = await Promise.allSettled(FX_PAIRS.map(pair => kisTerminal(
        '/uapi/overseas-price/v1/quotations/inquire-daily-chartprice', 'FHKST03030100', {
          FID_COND_MRKT_DIV_CODE: 'X', FID_INPUT_ISCD: pair.symbol,
          FID_INPUT_DATE_1: start, FID_INPUT_DATE_2: end, FID_PERIOD_DIV_CODE: 'D',
        }, 300_000)));
      const feeds: Parameters<typeof currencyIndicators>[0] = {};
      results.forEach((result, i) => { if (result.status === 'fulfilled') feeds[FX_PAIRS[i].symbol] = result.value; });
      const currencies = currencyIndicators(feeds, start, end, asOf);
      indicators.push(...currencies.indicators);
      warnings.push(...currencies.warnings);
    })(),
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => { if (r.status === 'rejected') { const label = ['KOSPI', 'KOSDAQ', '선물', '환율'][i]; warnings.push(label + ' 조회 대기'); console.warn('[terminal] source unavailable', label); } });
  quotes.sort((a, b) => (a.code === '0001' ? 0 : a.code === '1001' ? 1 : 2) - (b.code === '0001' ? 0 : b.code === '1001' ? 1 : 2));
  return Response.json({ ok: true, asOf, quotes, indicators, warnings } satisfies TerminalSnapshot, { headers: { 'Cache-Control': 'private, no-store' } });
}

import { hasDashboardAccess } from '@/lib/balta-access';
import { kisTerminal, outputRows } from '@/lib/kis-terminal';
import { finite, signedChange, type Quote, type TerminalSnapshot } from '@/lib/terminal-model';
import { commodityCode } from '@/lib/kis-directory';
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
      const body = await kisTerminal('/uapi/domestic-stock/v1/quotations/comp-interest', 'FHPST07020000', { FID_COND_MRKT_DIV_CODE: 'I', FID_COND_SCR_DIV_CODE: '20702', FID_DIV_CLS_CODE: '1', FID_DIV_CLS_CODE1: '' }, 300_000);
      const rows = [...outputRows(body.output1), ...outputRows(body.output2)];
      for (const [name, pattern] of [['국고채 3년', /국고.*(?:\D|^)3년/], ['국고채 10년', /국고.*(?:\D|^)10년/]] as const) {
        const r = rows.find(v => pattern.test(String(v.hts_kor_isnm).replace(/\s/g, '')) && finite(v.bond_mnrt_prpr) !== null);
        if (r) indicators.push({ code: name === '국고채 3년' ? 'kr3' : 'kr10', name, price: finite(r.bond_mnrt_prpr), change: signedChange(r.bond_mnrt_prdy_vrss, r.prdy_vrss_sign), rate: signedChange(r.prdy_ctrt ?? r.bstp_nmix_prdy_ctrt, r.prdy_vrss_sign), volume: null, turnover: null, unit: '%', asOf: String(r.stck_bsop_date || asOf) });
      }
      if (!indicators.some(q => q.code === 'kr3') || !indicators.some(q => q.code === 'kr10')) throw new Error('BOND_ROWS_MISSING');
    })(),
    (async () => {
      const today = kstParts().date;
      // FX@KRW: official frgn_code.mst currency symbol, class X.
      const body = await kisTerminal('/uapi/overseas-price/v1/quotations/inquire-daily-chartprice', 'FHKST03030100', { FID_COND_MRKT_DIV_CODE: 'X', FID_INPUT_ISCD: 'FX@KRW', FID_INPUT_DATE_1: moveDate(today, -10).replaceAll('-', ''), FID_INPUT_DATE_2: today.replaceAll('-', ''), FID_PERIOD_DIV_CODE: 'D' }, 300_000);
      const row = outputRows(body.output1)[0] ?? {};
      indicators.push({ code: 'fx', name: '원/달러', price: finite(row.ovrs_nmix_prpr), change: signedChange(row.ovrs_nmix_prdy_vrss, row.prdy_vrss_sign), rate: signedChange(row.prdy_ctrt, row.prdy_vrss_sign), volume: null, turnover: null, asOf });
    })(),
    ...(['CL', 'GC'] as const).map(product => (async () => {
      // Prefer the live futures quote. Alternative requests remain specific
      // to each instrument; the stock API's S classification documents gold only.
      let contract: Awaited<ReturnType<typeof commodityCode>> | null = null;
      try {
        contract = await commodityCode(product);
        if (!contract) throw new Error('해외선물 종목 대기');
        const body = await kisTerminal('/uapi/overseas-futureoption/v1/quotations/inquire-price', 'HHDFC55010000', { SRS_CD: contract.code }, 300_000);
        const row = outputRows(body.output1)[0] ?? {};
        const price = finite(row.last_price), previous = finite(row.prev_price);
        // Use actual prices for signs; overseas futures flags have their own convention.
        const change = price != null && previous != null ? price - previous : null;
        if (price === null) throw new Error('COMMODITY_PRICE_MISSING');
        indicators.push({ code: product === 'CL' ? 'wti' : 'gold', name: product === 'CL' ? 'WTI 선물' : '금 선물 (USD)', price, change, rate: change != null && previous ? change / previous * 100 : null, volume: finite(row.vol), turnover: null, unit: 'USD', asOf: String(row.proc_date || '') + ' ' + String(row.proc_time || '') });
      } catch {
        const today = kstParts().date;
        if (product === 'CL') {
          if (!contract?.exchange) throw new Error('COMMODITY_CONTRACT_MISSING');
          // Official overseas_futureoption/daily_ccnl: same contract and exchange.
          const body = await kisTerminal('/uapi/overseas-futureoption/v1/quotations/daily-ccnl', 'HHDFC55020100', {
            SRS_CD: contract.code, EXCH_CD: contract.exchange, START_DATE_TIME: '',
            CLOSE_DATE_TIME: today.replaceAll('-', ''), QRY_TP: 'Q', QRY_CNT: '30', QRY_GAP: '', INDEX_KEY: '',
          }, 300_000);
          const earliest = moveDate(today, -14).replaceAll('-', ''), latestDate = today.replaceAll('-', '');
          const rows = outputRows(body.output2)
            .filter(r => /^\d{8}$/.test(String(r.data_date)) && String(r.data_date) >= earliest && String(r.data_date) <= latestDate && finite(r.last_price) !== null)
            .sort((a, b) => String(b.data_date).localeCompare(String(a.data_date)));
          const latest = rows[0];
          if (!latest) throw new Error('COMMODITY_PRICE_MISSING');
          const price = finite(latest.last_price)!;
          const previous = finite(rows.find(r => String(r.data_date) < String(latest.data_date))?.last_price);
          const change = previous !== null ? price - previous : null;
          indicators.push({ code: 'wti', name: 'WTI 선물', price, change, rate: change !== null && previous ? change / previous * 100 : null,
            volume: finite(latest.vol), turnover: null, unit: 'USD', asOf: String(latest.data_date) });
          return;
        }
        // Official frgn_code.mst symbol NYGOLD: COMEX gold (USD), class S.
        const body = await kisTerminal('/uapi/overseas-price/v1/quotations/inquire-daily-chartprice', 'FHKST03030100', {
          FID_COND_MRKT_DIV_CODE: 'S', FID_INPUT_ISCD: 'NYGOLD',
          FID_INPUT_DATE_1: moveDate(today, -14).replaceAll('-', ''), FID_INPUT_DATE_2: today.replaceAll('-', ''), FID_PERIOD_DIV_CODE: 'D',
        }, 300_000);
        const row = outputRows(body.output1)[0] ?? {};
        const price = finite(row.ovrs_nmix_prpr);
        if (price === null) throw new Error('COMMODITY_PRICE_MISSING');
        const observed = outputRows(body.output2).find(r => /^\d{8}$/.test(String(r.stck_bsop_date || '')));
        indicators.push({ code: 'gold', name: '금 선물 (USD)', price,
          change: signedChange(row.ovrs_nmix_prdy_vrss, row.prdy_vrss_sign), rate: signedChange(row.prdy_ctrt, row.prdy_vrss_sign),
          volume: null, turnover: null, unit: 'USD', asOf: String(observed?.stck_bsop_date || asOf) });
      }
    })()),
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => { if (r.status === 'rejected') { const label = ['KOSPI', 'KOSDAQ', '선물', '채권 금리', '환율', 'WTI', '금'][i]; warnings.push(label + ' 조회 대기'); console.warn('[terminal] source unavailable', label); } });
  quotes.sort((a, b) => (a.code === '0001' ? 0 : a.code === '1001' ? 1 : 2) - (b.code === '0001' ? 0 : b.code === '1001' ? 1 : 2));
  return Response.json({ ok: true, asOf, quotes, indicators, warnings } satisfies TerminalSnapshot, { headers: { 'Cache-Control': 'private, no-store' } });
}

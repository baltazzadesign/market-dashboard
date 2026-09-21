import { hasDashboardAccess } from '@/lib/balta-access';
import { kisTerminal, outputRows } from '@/lib/kis-terminal';
import { finite, signedChange, type Quote } from '@/lib/terminal-model';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const url = new URL(request.url), sort = url.searchParams.get('sort') || 'up';
  if (!['up', 'down', 'turnover', 'volume'].includes(sort)) return Response.json({ ok: false, error: '정렬 기준을 확인해 주세요.' }, { status: 400 });
  const market = url.searchParams.get('market') || 'all';
  if (!['all', 'kospi', 'kosdaq'].includes(market)) return Response.json({ ok: false, error: '시장을 확인해 주세요.' }, { status: 400 });
  const code = market === 'kospi' ? '0001' : market === 'kosdaq' ? '1001' : '0000';
  try {
    const volume = sort === 'volume' || sort === 'turnover';
    const params: Record<string, string> = volume ? {
      FID_COND_MRKT_DIV_CODE: 'J', FID_COND_SCR_DIV_CODE: '20171', FID_INPUT_ISCD: code,
      FID_DIV_CLS_CODE: '0', FID_BLNG_CLS_CODE: sort === 'turnover' ? '3' : '0', FID_TRGT_CLS_CODE: '111111111', FID_TRGT_EXLS_CLS_CODE: '0000000000',
      FID_INPUT_PRICE_1: '', FID_INPUT_PRICE_2: '', FID_VOL_CNT: '', FID_INPUT_DATE_1: '',
    } : {
      FID_COND_MRKT_DIV_CODE: 'J', FID_COND_SCR_DIV_CODE: '20170', FID_INPUT_ISCD: code,
      FID_RANK_SORT_CLS_CODE: sort === 'down' ? '1' : '0', FID_INPUT_CNT_1: '0', FID_PRC_CLS_CODE: '0',
      FID_INPUT_PRICE_1: '', FID_INPUT_PRICE_2: '', FID_VOL_CNT: '', FID_TRGT_CLS_CODE: '0', FID_TRGT_EXLS_CLS_CODE: '0', FID_DIV_CLS_CODE: '0', FID_RSFL_RATE1: '', FID_RSFL_RATE2: '',
    };
    const body = await kisTerminal(volume ? '/uapi/domestic-stock/v1/quotations/volume-rank' : '/uapi/domestic-stock/v1/ranking/fluctuation', volume ? 'FHPST01710000' : 'FHPST01700000', params);
    const asOf = new Date().toISOString();
    const rows: Quote[] = outputRows(body.output).map(r => ({ code: String(r.stck_shrn_iscd || r.mksc_shrn_iscd || ''), name: String(r.hts_kor_isnm || ''), price: finite(r.stck_prpr), change: signedChange(r.prdy_vrss, r.prdy_vrss_sign), rate: signedChange(r.prdy_ctrt, r.prdy_vrss_sign), volume: finite(r.acml_vol), turnover: finite(r.acml_tr_pbmn), asOf })).filter(r => r.code && r.name);
    return Response.json({ ok: true, asOf, rows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ ok: false, rows: [], error: '종목 순위를 불러오지 못했습니다. 다시 조회해 주세요.' }, { status: 503 }); }
}

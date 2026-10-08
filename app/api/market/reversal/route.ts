import { hasDashboardAccess } from '@/lib/balta-access';
import { cachedReversalUniverse, loadReversalDetail, loadReversalQuotes } from '@/lib/reversal-data';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const p = new URL(request.url).searchParams, stage = p.get('stage')||'universe';
  if (!['universe','quotes','detail'].includes(stage)) return Response.json({ok:false,error:'조회 단계를 확인해 주세요.'},{status:400,headers});
  const codes = (p.get('codes')??'').split(',');
  if (stage!=='universe' && (codes.length>(stage==='detail'?1:30) || codes.some(c=>!/^\d{6}$/.test(c)) || new Set(codes).size!==codes.length)) return Response.json({ok:false,error:'종목코드를 확인해 주세요.'},{status:400,headers});
  try {
    const universe = await cachedReversalUniverse();
    if (stage==='universe') return Response.json(universe,{headers});
    if (p.get('context')!==universe.context) return Response.json({ok:false,error:'기준 거래일이나 조회 구간이 바뀌었습니다. 전체 조회를 다시 시작해 주세요.'},{status:409,headers});
    const directory = new Map(universe.rows.map(r=>[r.code,r]));
    if(codes.some(c=>!directory.has(c))) return Response.json({ok:false,error:'현재 조회 대상에 없는 종목입니다.'},{status:400,headers});
    const stocks = codes.map(c=>directory.get(c)!);
    if(stage==='quotes') return Response.json(await loadReversalQuotes(stocks),{headers});
    return Response.json({ok:true,row:await loadReversalDetail(stocks[0],universe)},{headers});
  } catch { return Response.json({ok:false,error:'후보 데이터를 조회하지 못했습니다. KIS 연결 또는 시장 데이터 갱신 상태를 확인하고 다시 조회해 주세요.'},{status:503,headers}); }
}

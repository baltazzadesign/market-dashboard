import { hasDashboardAccess } from '@/lib/balta-access';
import { kstParts } from '@/lib/balta-model';
import { cachedStockFlow } from '@/lib/stock-flow-data';
import { stockRanges, type StockRange } from '@/lib/stock-flow-model';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control':'private, no-store', Vary:'Cookie' };
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const p = new URL(request.url).searchParams, code = p.get('code') || '', range = (p.get('range') || '1M') as StockRange;
  if (!/^\d{6}$/.test(code) || !stockRanges.includes(range)) return Response.json({ok:false,error:'종목코드와 조회 기간을 확인해 주세요.'},{status:400,headers});
  try { return Response.json(await cachedStockFlow(code,range,kstParts().date),{headers}); }
  catch (error) { return Response.json({ok:false,error:error instanceof Error ? error.message : '종목 데이터를 불러오지 못했습니다.'},{status:503,headers}); }
}

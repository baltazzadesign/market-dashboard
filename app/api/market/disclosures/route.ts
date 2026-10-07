import {hasDashboardAccess} from '@/lib/balta-access';
import {CashFlowError} from '@/lib/cash-flow-data';
import {cachedStockDisclosures} from '@/lib/stock-disclosures-data';
import {stockDate} from '@/lib/stock-flow-model';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const q=new URL(request.url).searchParams,code=q.get('code')??'',start=q.get('start')??'',end=q.get('end')??'';
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!/^\d{6}$/.test(code)||stockDate(start)!==start||stockDate(end)!==end||start>end||end>today||Date.parse(end)-Date.parse(start)>366*86400000)return Response.json({ok:false,error:'종목코드와 조회 기간을 확인해 주세요. 최대 1년까지 조회할 수 있습니다.'},{status:400,headers});
  try{return Response.json(await cachedStockDisclosures(code,start,end),{headers});}
  catch(e){return Response.json({ok:false,code:e instanceof CashFlowError?e.code:'UPSTREAM_ERROR',error:e instanceof CashFlowError?e.message:'공시 연결 중 오류가 발생했습니다.'},{status:e instanceof CashFlowError&&e.code==='CORP_NOT_FOUND'?404:503,headers});}
}

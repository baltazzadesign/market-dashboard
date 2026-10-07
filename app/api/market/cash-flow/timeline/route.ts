import { hasDashboardAccess } from '@/lib/balta-access';
import { CashFlowError } from '@/lib/cash-flow-data';
import { cachedCashTimeline } from '@/lib/cash-flow-timeline-data';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const code=new URL(request.url).searchParams.get('code')??'';
  if(!/^\d{6}$/.test(code))return Response.json({ok:false,error:'6자리 종목코드를 입력해 주세요.'},{status:400,headers});
  try{return Response.json(await cachedCashTimeline(code),{headers});}
  catch(error){return Response.json({ok:false,code:error instanceof CashFlowError?error.code:'UPSTREAM_ERROR',error:error instanceof CashFlowError?error.message:'현금흐름 공시 연결 중 오류가 발생했습니다.'},{status:error instanceof CashFlowError&&error.code==='CORP_NOT_FOUND'?404:503,headers});}
}

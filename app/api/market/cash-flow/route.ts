import { hasDashboardAccess } from '@/lib/balta-access';
import { cachedCashFlow, CashFlowError } from '@/lib/cash-flow-data';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request: Request) {
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const params=new URL(request.url).searchParams,code=params.get('code') ?? '';
  const endYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))-1;
  if(!/^\d{6}$/.test(code))return Response.json({ok:false,error:'6자리 종목코드를 입력해 주세요.'},{status:400,headers});
  try{return Response.json(await cachedCashFlow(code,endYear),{headers});}
  catch(error){return Response.json({ok:false,code:error instanceof CashFlowError?error.code:'UPSTREAM_ERROR',error:error instanceof CashFlowError?error.message:'재무정보 조회 중 오류가 발생했습니다.'},{status:error instanceof CashFlowError && error.code==='CORP_NOT_FOUND'?404:503,headers});}
}


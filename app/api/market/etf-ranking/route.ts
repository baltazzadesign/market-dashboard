import {hasDashboardAccess} from '@/lib/balta-access';
import {stockDate} from '@/lib/stock-flow-model';
import {readEtfRanking} from '@/lib/etf-ranking-store';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!await hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const date=new URL(request.url).searchParams.get('date')||undefined;
  if(date&&stockDate(date)!==date)return Response.json({ok:false,error:'날짜를 확인해 주세요.'},{status:400,headers});
  try{return Response.json(await readEtfRanking(date),{headers});}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'ETF 순위 조회 실패'},{status:503,headers});}
}

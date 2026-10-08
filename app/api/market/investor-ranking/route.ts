import { hasDashboardAccess } from '@/lib/balta-access';
import { stockDate, type StockInvestor } from '@/lib/stock-flow-model';
import { rankingInvestors, rankingMarkets, type RankingMarket } from '@/lib/investor-ranking';
import { readInvestorRanking } from '@/lib/investor-ranking-store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const params=new URL(request.url).searchParams,date=params.get('date')||undefined;
  const investor=(params.get('investor')||'pension') as StockInvestor,market=(params.get('market')||'all') as RankingMarket;
  if((date&&stockDate(date)!==date)||!rankingInvestors.includes(investor)||!rankingMarkets.includes(market))return Response.json({ok:false,error:'날짜·투자 주체·시장을 확인해 주세요.'},{status:400,headers});
  try{return Response.json(await readInvestorRanking(date,investor,market),{headers});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'매매 순위를 불러오지 못했습니다.'},{status:503,headers});}
}

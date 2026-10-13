import { hasDashboardAccess } from '@/lib/balta-access';
import { kstParts } from '@/lib/balta-model';
import { stockDate, type StockInvestor } from '@/lib/stock-flow-model';
import { rankingInvestors, rankingMarkets, type RankingMarket } from '@/lib/investor-ranking';
import { defaultFlowWatchCriteria, validFlowCriteria, validFlowMonth } from '@/lib/investor-flow-watch';
import { loadFlowWatch } from '@/lib/investor-flow-watch-data';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
  const p=new URL(request.url).searchParams,today=kstParts().date,month=p.get('month')||today.slice(0,7),date=p.get('date')||undefined;
  const investor=(p.get('investor')||'pension') as StockInvestor,market=(p.get('market')||'all') as RankingMarket;
  const criteria={minimumDays:Number(p.get('days')??defaultFlowWatchCriteria.minimumDays),reentryWindow:Number(p.get('window')??defaultFlowWatchCriteria.reentryWindow),minimumAmount:Number(p.get('amount')??defaultFlowWatchCriteria.minimumAmount)};
  if(!validFlowMonth(month)||month>today.slice(0,7)||month<'2000-01'||(date&&(stockDate(date)!==date||!date.startsWith(month)||date>today))||!rankingInvestors.includes(investor)||!rankingMarkets.includes(market)||!validFlowCriteria(criteria))return Response.json({ok:false,error:'날짜·투자 주체·추적 기준을 확인해 주세요.'},{status:400,headers});
  try{return Response.json(await loadFlowWatch(month,date,investor,market,criteria,new Date(),p.get('fresh')==='1'),{headers});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'수급 추적을 불러오지 못했습니다.'},{status:503,headers});}
}

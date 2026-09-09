import {hasDashboardAccess} from '@/lib/balta-access';
import {requestedDate,marketError} from '@/lib/balta-data';
import {researchRequest} from '@/lib/research-data';
import {marketClosedReason,parseAdditionalHolidays} from '@/lib/market-calendar';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{const date=requestedDate(request);if(marketClosedReason(date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)))return Response.json({ok:true,snapshot:null});
 const query=new URLSearchParams({select:'market,time,sectors,captured_at',trade_date:'eq.'+date,order:'market.asc'});
 const rows=await researchRequest('market_sector_daily?'+query,request.signal);
 const items=rows.flatMap(r=>Array.isArray(r.sectors)?r.sectors:[]);
 return Response.json({ok:true,snapshot:rows.length?{time:rows.map(r=>String(r.market).toUpperCase()+' '+r.time).join(' / '),market_data:{sectors:items}}:null},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}

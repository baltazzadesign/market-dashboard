import {hasDashboardAccess} from '@/lib/balta-access';
import {requestedDate,marketError} from '@/lib/balta-data';
import {researchRequest} from '@/lib/research-data';
import {marketClosedReason,parseAdditionalHolidays} from '@/lib/market-calendar';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{
  const date=requestedDate(request);
  if(marketClosedReason(date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS))){
   return Response.json({ok:true,date,snapshot:null},{headers:{'Cache-Control':'private, no-store'}});
  }
  const query=new URLSearchParams({select:'market,time,sectors,captured_at',trade_date:'eq.'+date,order:'market.asc'});
  const rows=await researchRequest('market_sector_daily?'+query,request.signal);
  const found=new Map<string,Record<string,unknown>>();
  for(const row of rows){
   const market=String(row.market??'').toLowerCase()==='kosdaq'?'kosdaq':'kospi';
   const sectors=Array.isArray(row.sectors)?row.sectors:[];
   for(const raw of sectors){
    if(!raw||typeof raw!=='object')continue;
    const sector=raw as Record<string,unknown>;
    const code=String(sector.code??'').trim();
    const name=String(sector.name??'').trim();
    if(!code||!name)continue;
    const normalizedMarket=String(sector.market??market).toLowerCase()==='kosdaq'?'kosdaq':'kospi';
    found.set(`${normalizedMarket}:${code}`,{...sector,market:normalizedMarket,code,name});
   }
  }
  const items=[...found.values()];
  const times=rows.map(r=>String(r.market).toUpperCase()+' '+r.time);
  const capturedAt=rows.map(r=>String(r.captured_at??'')).filter(Boolean).sort().at(-1)??null;
  return Response.json({
   ok:true,
   date,
   snapshot:rows.length?{
    time:times.join(' / '),
    capturedAt,
    counts:{all:items.length,kospi:items.filter(x=>x.market==='kospi').length,kosdaq:items.filter(x=>x.market==='kosdaq').length},
    market_data:{sectors:items},
   }:null,
  },{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}

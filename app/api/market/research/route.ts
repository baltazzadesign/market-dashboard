import {hasDashboardAccess} from '@/lib/balta-access';
import {MarketDataError,marketError} from '@/lib/balta-data';
import {isValidDate,kstParts,normalizeRows} from '@/lib/balta-model';
import {marketClosedReason,parseAdditionalHolidays} from '@/lib/market-calendar';
import {researchRequest} from '@/lib/research-data';
import {storedEvents} from '@/lib/market-research';
import {signalPerformance} from '@/lib/market-diagnostics';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{const q=new URL(request.url).searchParams,start=q.get('start')??'',end=q.get('end')??'',market=q.get('market')??'kospi',h=q.get('horizon')??'30';
 if(!isValidDate(start)||!isValidDate(end)||end<start||end>kstParts().date||(Date.parse(end)-Date.parse(start))/86400000>6||!['kospi','kosdaq'].includes(market)||!['30','60','close'].includes(h))throw new MarketDataError('기간은 최대 7일이며 날짜·평가 기준을 확인하세요.',400);
 const grouped=new Map<string,Record<string,unknown>[]>(),holidays=parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
 for(let offset=0;offset<15000;offset+=500){const query=new URLSearchParams({select:'id,createdat,time,up,down,flat,diff,kospi,kosdaq,signals,marketstate,market_data',and:`(createdat.gte.${start},createdat.lte.${end})`,order:'createdat.asc,id.asc',limit:'500',offset:String(offset)});
 const values=await researchRequest('logs?'+query,request.signal);
 for(const v of values){
 const md=v.market_data as Record<string,{priceSource?:string}>|null;
 // Reject explicitly marked stale/fallback prices; legacy records without
 // provenance remain identifiable as a limitation of the historical archive.
 if(md)for(const index of ['kospi','kosdaq'])if(md[index]?.priceSource&&md[index].priceSource!=='LIVE')v[index]=null;
 const date=String(v.createdat);if(marketClosedReason(date,holidays))continue;const list=grouped.get(date)??[];list.push(v);grouped.set(date,list);}
 if(values.length<500)break;if(offset===14500)throw new MarketDataError('중복 기록이 너무 많아 집계를 중단했습니다.',502);}
 const stats=new Map<string,ReturnType<typeof signalPerformance>[number]>();let records=0;
 for(const [date,raw] of grouped){const rows=normalizeRows(raw,date);records+=rows.length;const events=storedEvents(rows);for(const g of signalPerformance(rows,events,market as 'kospi'|'kosdaq',h==='close'?'close':Number(h) as 30|60)){const old=stats.get(g.label);stats.set(g.label,old?{...g,count:g.count+old.count,pending:g.pending+old.pending,wins:g.wins+old.wins,sum:g.sum+old.sum}:g);}}
 return Response.json({ok:true,stats:[...stats.values()],dates:[...grouped.keys()],records,start,end},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}

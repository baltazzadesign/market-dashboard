import { hasDashboardAccess } from '@/lib/balta-access';
import { MarketDataError,marketError,requestedDate } from '@/lib/balta-data';
import { kstParts,moveDate,normalizeRow } from '@/lib/balta-model';
import { marketClosedReason,parseAdditionalHolidays } from '@/lib/market-calendar';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401});
 try{
  const date=requestedDate(request),time=new URL(request.url).searchParams.get('time')??'';
  if(date>kstParts().date||!/^\d{2}:\d{2}$/.test(time)||time<'09:00'||time>'15:30'||Number(time.slice(3))>59)throw new MarketDataError('조회 날짜와 시간을 확인하세요.',400);
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new MarketDataError('저장 데이터 연결 설정을 확인하세요.',503);
  const start=moveDate(date,-60),holidays=parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
  const days=new Map<string,ReturnType<typeof normalizeRow>>();
  for(let offset=0;offset<5000;offset+=500){
   const query=new URLSearchParams({select:'*',and:`(createdat.gte.${start},createdat.lt.${date})`,time:'eq.'+time,order:'createdat.desc,id.desc',limit:'500',offset:String(offset)});
   const response=await fetch(url.replace(/\/$/,'').replace(/\/rest\/v1$/,'')+'/rest/v1/logs?'+query,{headers:{apikey:key,authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw new MarketDataError('동시간대 기록을 읽지 못했습니다.',502);
   const values:unknown=await response.json();if(!Array.isArray(values))throw new MarketDataError('기록 형식 오류',502);
   for(const value of values){const d=String(value.createdat??'');if(marketClosedReason(d,holidays)||days.has(d))continue;days.set(d,normalizeRow(value,d));}
   if(values.length<500)break;
   if(offset===4500)throw new MarketDataError('중복 기록이 너무 많습니다.',502);
  }
  const rows=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  return Response.json({ok:true,rows,start,date,time},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}

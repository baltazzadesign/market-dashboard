import { marketClosedReason, parseAdditionalHolidays } from "./market-calendar";
import { MarketDataError } from "./balta-data";
import { dailyFromRecord, type DailyMarket } from "./market-history-model";
import { isValidDate } from "./balta-model";
export async function readHistory(start: string,end: string,signal?:AbortSignal):Promise<DailyMarket[]> {
  if(!isValidDate(start)||!isValidDate(end)||start>end)throw new MarketDataError("조회 기간을 확인해 주세요.",400);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,"").replace(/\/rest\/v1$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new MarketDataError("Supabase 연결 설정이 필요합니다. 실행 안내의 환경 변수를 확인해 주세요.",503);
  const all:DailyMarket[]=[];
  // Small pages remain correct under Supabase's default 1,000-row cap.
  for(let offset=0;;offset+=250){
    const query=new URLSearchParams({select:"trade_date,snapshot",order:"trade_date.asc",limit:"250",offset:String(offset)});
    query.append("trade_date","gte."+start);query.append("trade_date","lte."+end);
    const response=await fetch(url+"/rest/v1/market_daily?"+query,{headers:{apikey:key,authorization:"Bearer "+key},cache:"no-store",
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      if(["42P01","PGRST205"].includes(body.code))throw new MarketDataError("시장 기록 저장 구조를 먼저 적용해 주세요. supabase/migrations/001_market_history.sql 실행이 필요합니다.",503);
      throw new MarketDataError("시장 기록을 읽지 못했습니다. 연결 상태를 확인해 주세요.",502);
    }
    const raw:unknown=await response.json();
    if(!Array.isArray(raw))throw new MarketDataError("시장 기록 응답 형식이 올바르지 않습니다.",502);
    all.push(...raw.map(dailyFromRecord).filter((d):d is DailyMarket=>d!==null));
    if(raw.length<250)break;
    if(offset>=5000)throw new MarketDataError("한 번에 조회할 수 있는 기간을 초과했습니다.",400);
  }
  const additional=parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
  return all.filter(day=>!marketClosedReason(day.date,additional));
}

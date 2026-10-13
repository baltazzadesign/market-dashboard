import { stockDate, type StockInvestor } from './stock-flow-model';
import { kstParts } from './balta-model';
import { parseAdditionalHolidays } from './market-calendar';
import type { RankingMarket } from './investor-ranking';
import type { InvestorHistorySession, StoredFlowHistoryDay } from './investor-flow-history';
import { buildFlowWatchReport, flowMonthEnd, type FlowWatchCriteria } from './investor-flow-watch';

async function historyDb<T>(path:string,init:RequestInit={}):Promise<T>{
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('수급 이력 저장소 설정을 확인해 주세요.');
  const response=await fetch(base+'/rest/v1/'+path,{...init,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',...init.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('수급 이력 저장소에 연결하지 못했습니다. investor-flow-history.sql 설치와 서버 설정을 확인해 주세요.');
  const text=await response.text();return (text?JSON.parse(text):null) as T;
}
export async function verifyFlowHistoryStore(){await historyDb('investor_flow_history?select=date&limit=1');}
export async function writeFlowHistoryDays(days:StoredFlowHistoryDay[]){
  // Each trading date is atomic and retryable. No browser request does this work.
  for(const day of days){
    if(stockDate(day.date)!==day.date||day.snapshot.version!==1)throw Error('수급 이력 저장 형식을 확인해 주세요.');
    await historyDb('investor_flow_history?on_conflict=date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(day)});
  }
}
const cache=new Map<string,{expires:number;value:Promise<InvestorHistorySession[]>}>();
export async function loadFlowWatch(month:string,date:string|undefined,investor:StockInvestor,market:RankingMarket,criteria:FlowWatchCriteria,now=new Date(),fresh=false){
  const today=kstParts(now).date;
  const from=new Date(Date.parse(month+'-01T00:00:00Z')-75*86400000).toISOString().slice(0,10),to=flowMonthEnd(month)<today?flowMonthEnd(month):today;
  const key=[from,to,investor,market].join(':');
  let value=cache.get(key)?.expires!>Date.now()&&!fresh?cache.get(key)!.value:null;
  if(!value){
    value=historyDb<InvestorHistorySession[]>('rpc/read_investor_flow_history',{method:'POST',body:JSON.stringify({p_from:from,p_to:to,p_investor:investor,p_market:market})});
    cache.set(key,{expires:Date.now()+60000,value});
    if(cache.size>10)cache.delete(cache.keys().next().value!);
    value.catch(()=>{if(cache.get(key)?.value===value)cache.delete(key);});
  }
  const sessions=await value;
  if(!Array.isArray(sessions)||sessions.some(s=>!Array.isArray(s.rows)||!Array.isArray(s.calendar)))throw Error('수급 이력 형식을 확인해 주세요.');
  return buildFlowWatchReport(sessions,month,date,investor,market,criteria,today,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
}

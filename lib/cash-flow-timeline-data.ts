// Server-only: credentials and DART request URLs never reach client components.
import { cachedQuarterCashFlow, CashFlowError } from './cash-flow-data';
import { buildCashTimeline, parseDisclosures, type CashDisclosure, type CashTimelineResponse } from './cash-flow-timeline';
import type { QuarterCashFlowResponse } from './cash-flow-quarter';
const cache=new Map<string,{until:number;promise:Promise<CashTimelineResponse>}>();
export async function loadCashDisclosures(data:QuarterCashFlowResponse,now=new Date(),fetcher:typeof fetch=fetch,deadline=Date.now()+20000):Promise<CashDisclosure[]> {
  const key=process.env.DART_API_KEY?.trim();
  if(!key)throw new CashFlowError('현금흐름 데이터 연결이 설정되지 않았습니다.','DART_NOT_CONFIGURED');
  if(!data.quarters.length)return [];
  const start=Math.min(...data.quarters.map(q=>q.year))-1;
  const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
  let pages=1;const rows:unknown[]=[];
  for(let page=1;page<=pages;page++){
    const remaining=deadline-Date.now();if(remaining<100)throw new CashFlowError('공시 날짜 조회 시간이 초과됐습니다. 현금흐름을 다시 조회해 주세요.','TIMEOUT');
    const url=new URL('https://opendart.fss.or.kr/api/list.json');
    url.search=new URLSearchParams({crtfc_key:key,corp_code:data.corpCode,bgn_de:`${start}0101`,end_de:end,pblntf_ty:'A',last_reprt_at:'N',sort:'date',sort_mth:'asc',page_count:'100',page_no:String(page)}).toString();
    let body:{status?:string;list?:unknown[];total_page?:number|string};
    try{const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});if(!r.ok)throw new Error();body=await r.json();}
    catch{throw new CashFlowError('공시 날짜를 확인하지 못했습니다. 현금흐름을 다시 조회해 주세요.');}
    if(body.status==='013'){if(page!==1)throw new CashFlowError('공시 목록 일부를 받지 못했습니다. 다시 조회해 주세요.');return [];}
    if(body.status!=='000')throw new CashFlowError(body.status==='020'?'OpenDART 요청 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.':['010','011','012','901'].includes(body.status??'')?'OpenDART 인증키의 이용 상태를 확인해 주세요.':'공시 목록 조회에 실패했습니다.',body.status||'UPSTREAM_ERROR');
    const total=Number(body.total_page);
    if(!Array.isArray(body.list)||!Number.isInteger(total)||total<1||total>5||page>1&&total!==pages)throw new CashFlowError('공시 목록 전체를 확인하지 못해 날짜 연결을 보류합니다. 다시 조회해 주세요.');
    pages=total;rows.push(...body.list);
  }
  return parseDisclosures(rows,data.corpCode).filter(f=>f.date.replaceAll('-','')<=end);
}
export async function loadCashTimeline(code:string,now=new Date(),fetcher:typeof fetch=fetch,load:(code:string,now:Date)=>Promise<QuarterCashFlowResponse>=cachedQuarterCashFlow):Promise<CashTimelineResponse> {
  const deadline=Date.now()+55000,data=await load(code,now);
  const disclosures=await loadCashDisclosures(data,now,fetcher,deadline);
  const result=buildCashTimeline(data,disclosures);
  if(!result.events.length)result.warnings.push('재무 공시 날짜를 연결하지 못했습니다. 확인되지 않은 값을 과거 차트에 표시하지 않습니다.');
  return result;
}
export function cachedCashTimeline(code:string,now=new Date()):Promise<CashTimelineResponse> {
  const key=code+':'+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now),hit=cache.get(key);
  if(hit&&hit.until>Date.now())return hit.promise;
  for(const [k,v] of cache)if(v.until<Date.now())cache.delete(k);
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  const promise=loadCashTimeline(code,now);cache.set(key,{until:Date.now()+300000,promise});
  promise.then(data=>{const entry=cache.get(key);if(entry?.promise===promise)entry.until=Date.now()+(data.warnings.some(w=>/실패|못했|못해/.test(w))?30000:900000);},()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
  return promise;
}

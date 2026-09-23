import type { FutureBar, FutureContract, FutureProduct, FutureQuote } from './futures-model';
import type { FutureCalendar, FutureSession, SessionMode } from './futures-session';
export async function futuresDb<T>(path:string,init:RequestInit={}):Promise<T> {
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('선물 저장소 설정이 필요합니다.');
  const res=await fetch(base+'/rest/v1/'+path,{...init,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',...init.headers},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('선물 저장소 응답 오류 ('+res.status+'). 마이그레이션과 연결을 확인해 주세요.');
  const text=await res.text();return (text?JSON.parse(text):null) as T;
}
export const upsertFutures = (table:string,rows:unknown[],conflict:string) => futuresDb(table+'?on_conflict='+conflict,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
export async function storedContracts(product:FutureProduct) { return futuresDb<FutureContract[]>('futures_contracts?select=*&product=eq.'+product+'&order=expiry.asc'); }
export async function storedQuotes(product:FutureProduct,code:string,mode:SessionMode) {
  const q=new URLSearchParams({select:'snapshot',product:'eq.'+product,contract_code:'eq.'+code,order:'observed_at.desc',limit:'2'});
  if(mode!=='ALL')q.set('session','eq.'+mode);
  return (await futuresDb<{snapshot:FutureQuote}[]>('futures_quotes?'+q)).map(r=>r.snapshot);
}
export async function storedBars(product:FutureProduct,mode:SessionMode,start:string,end:string,code?:string,continuous=false) {
  const q=new URLSearchParams({select:'*',product:'eq.'+product,'timestamp':'gte.'+start,and:'(timestamp.lte.'+end+')',order:'timestamp.asc,contract_code.asc',limit:'1000'});
  if(mode!=='ALL')q.set('session','eq.'+mode);
  if(code)q.set('contract_code','eq.'+code);
  if(continuous)q.set('is_front','eq.true');
  const rows:FutureBar[]=[];
  for(let offset=0;offset<3000;offset+=1000){q.set('offset',String(offset));const page=await futuresDb<FutureBar[]>('futures_minutes?'+q);rows.push(...page);if(page.length<1000)break;}
  return rows;
}
// Server-side daily aggregation avoids transferring an entire year's minute bars.
export async function storedDaily(product:FutureProduct,mode:SessionMode,start:string,end:string,code:string|null,continuous:boolean) {
  return futuresDb<FutureBar[]>('rpc/futures_daily_bars',{method:'POST',body:JSON.stringify({p_product:product,p_mode:mode,p_start:start,p_end:end,p_code:code,p_front:continuous})});
}
let calendarCache:{until:number;value:FutureCalendar}|null=null;
export async function storedCalendar():Promise<FutureCalendar> {
  if(calendarCache&&calendarCache.until>Date.now())return calendarCache.value;
  const rows=await futuresDb<{date:string;open:boolean}[]>('futures_calendar?select=date,open&limit=1000');
  const value=Object.fromEntries(rows.map(r=>[r.date,{open:r.open}]));calendarCache={until:Date.now()+3600000,value};return value;
}
export function acquireFuturesLease(owner:string) {return futuresDb<boolean>('rpc/futures_lease',{method:'POST',body:JSON.stringify({p_owner:owner})});}
export function persistFutures(owner:string,bars:FutureBar[],quotes:FutureQuote[]) {return futuresDb('rpc/futures_write',{method:'POST',body:JSON.stringify({p_owner:owner,p_bars:bars,p_quotes:quotes})});}
export async function lastNightQuote(product:FutureProduct) {
  return futuresDb<{snapshot:FutureQuote}[]>('futures_quotes?select=snapshot&product=eq.'+product+'&session=eq.NIGHT&order=observed_at.desc&limit=1');
}
export type CollectorHealth={connected:boolean;updated_at:string;last_error:string|null;last_message_at:string|null};
export async function collectorHealth(){return (await futuresDb<CollectorHealth[]>('futures_collector?select=connected,updated_at,last_error,last_message_at&id=eq.main&limit=1'))[0]??null;}
export type {FutureSession};

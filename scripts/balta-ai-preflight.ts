// No-write preflight. Run only in trusted CI; never print token, URL, or response bodies.
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { stockDate, stockNumber } from '../lib/stock-flow-model';
import { FLOW_HISTORY_INVESTORS } from '../lib/investor-flow-history';
const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','KIS_APPKEY','KIS_APPSECRET'] as const;
for(const name of names){
  if(!process.env[name])throw Error('Required Actions secret missing: '+name);
}
const base=process.env.SUPABASE_URL!.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
if(!base.startsWith('https://')||!base.endsWith('.supabase.co'))throw Error('SUPABASE_URL must be a Supabase https project URL');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
const failures:string[]=[];
async function read<T>(resource:string):Promise<T>{
  const res=await fetch(base+'/rest/v1/'+resource,{headers:{apikey:key,authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Supabase API read failed HTTP '+res.status);
  return await res.json() as T;
}
async function main(){
try{
  const tables=['balta_ai_signals','balta_ai_outcomes','balta_ai_run_log'] as const;
  for(const t of tables){
    const result=await read<unknown[]>(t+'?select=trade_date&limit=1');
    if(!Array.isArray(result))throw Error('Bad table response '+t);
    console.log('[BALTA PREFLIGHT] DB table reachable:',t);
  }
  const source=await read<Array<{date:string;universe_date:string;observed_at:string}>>(
    'investor_flow_history?select=date,universe_date,observed_at&order=date.desc&limit=2');
  if(source.length<2||source[0].universe_date!==source[0].date)throw Error('Flow-history not ready');
  const observed=Date.parse(source[0].observed_at);
  if(!Number.isFinite(observed))throw Error('Invalid flow observed_at');
  if(FLOW_HISTORY_INVESTORS.indexOf('foreign')!==1 || FLOW_HISTORY_INVESTORS.indexOf('institution')!==2)
    throw Error('Investor source schema has changed');
  console.log('[BALTA PREFLIGHT] Latest flow date:',source[0].date);
}catch{
  failures.push('Supabase table/flow history read failed; check URL, service key and table state');
}
try{
  const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
    'FHPUP02120000',{FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',
      FID_INPUT_ISCD:'0001',FID_INPUT_DATE_1:new Intl.DateTimeFormat('en-CA',
        {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','')},0);
  const rows=outputRows(body.output2);
  const good=rows.some(r=>stockDate(r.stck_bsop_date)!==null && (stockNumber(r.bstp_nmix_prpr)??0)>0);
  if(!good)throw Error('No valid index daily rows');
  console.log('[BALTA PREFLIGHT] KIS daily index read OK');
}catch{
  failures.push('KIS daily index probe failed; check KIS keys and stored KIS token validity');
}
if(failures.length){
  for(const failure of failures)console.error('::error::'+failure);
  process.exitCode=1;
}else console.log('[BALTA PREFLIGHT] PASS — read-only credentials/connectivity validated; live paper worker not yet run');

}
main().catch(()=>{console.error('::error::BALTA preflight crashed before completion');process.exitCode=1;});

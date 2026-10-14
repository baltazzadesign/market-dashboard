// BALTA paper-trading research loop. Read-only KIS queries, private Supabase writes.
// Run --phase=morning before 09:00 KST, --phase=close after 16:30 KST.
// Never place orders, silently fill missing observations, or revise historic picks.
import { kstParts, record } from '../lib/balta-model';
import { marketClosedReason, parseAdditionalHolidays } from '../lib/market-calendar';
import { FLOW_HISTORY_INVESTORS, type FlowHistoryDay } from '../lib/investor-flow-history';
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { parseStockBars } from '../lib/stock-flow-model';

type Pick={code:string;name:string;market:string;score:number;foreign:number;institution:number;pension:number;reason:string};
type Signal={trade_date:string;strategy:string;source_date:string;source_observed_at:string;generated_at:string;picks:Pick[]};
const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!secret)throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const strategies=['FLOW_V1','FLOW_ACCEL_V1'] as const;
async function db<T>(resource:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(base+'/rest/v1/'+resource,{...options,headers:{apikey:secret!,authorization:'Bearer '+secret,'content-type':'application/json',...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('BALTA storage error '+response.status+' '+(await response.text()).slice(0,240));
  const raw=await response.text();return (raw?JSON.parse(raw):null) as T;
}
async function store(table:string,row:unknown,conflict:string){
  await db(table+'?on_conflict='+conflict,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row)});
}
async function runLog(date:string,phase:string,result:string,details:unknown){
  await db('balta_ai_run_log?on_conflict=trade_date,phase',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({trade_date:date,phase,result,details,executed_at:new Date().toISOString()})});
}
async function morning(date:string){
  const existing=await db<Signal[]>('balta_ai_signals?select=trade_date,strategy&trade_date=eq.'+date);
  if(existing.length===2){console.log('Morning signal already fixed for',date);return;}
  const rows=await db<{date:string;universe_date:string;observed_at:string;snapshot:FlowHistoryDay}[]>('investor_flow_history?select=date,universe_date,observed_at,snapshot&date=lt.'+date+'&order=date.desc&limit=5');
  if(rows.length<3)throw Error('At least 3 prior flow observations required');
  const latest=rows[0], codes=Object.keys(record(latest.snapshot.stocks));
  if(latest.universe_date!==latest.date || !codes.length)throw Error('Stale or invalid investor universe');
  if(Date.parse(latest.observed_at)>=Date.parse(date+'T09:00:00+09:00'))throw Error('Historical data as-of leakage');
  const iF=FLOW_HISTORY_INVESTORS.indexOf('foreign'),iI=FLOW_HISTORY_INVESTORS.indexOf('institution'),iP=FLOW_HISTORY_INVESTORS.indexOf('pension');
  const ranked:Pick[]=[];
  for(const code of codes){
    if(!/^\d{6}$/.test(code))continue;
    const history=rows.map(row=>row.snapshot.stocks?.[code]);
    if(history.some(h=>!h || !Array.isArray(h.net)))continue;
    const f=history.map(h=>h!.net[iF]),inst=history.map(h=>h!.net[iI]),pen=history.map(h=>h!.net[iP]);
    if([...f,...inst,...pen].some(v=>typeof v!=='number'||!Number.isFinite(v)))continue;
    const both=f[0]!+inst[0]!,prior=f[1]!+inst[1]!;
    if(f[0]!<=0||inst[0]!<=0||both<=0)continue;
    const stock=history[0]!;
    ranked.push({code,name:stock.name,market:stock.market,foreign:f[0]!,institution:inst[0]!,pension:pen[0]!,score:both,reason:'전일 외국인·기관 동반 순매수(억원)'});
  }
  if(!ranked.length)throw Error('No candidates with verified investor amounts');
  const selections={
    FLOW_V1:[...ranked].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,10),
    FLOW_ACCEL_V1:[...ranked].map(p=>{
      const previous=rows[1].snapshot.stocks[p.code]!.net;
      const momentum=p.score-(previous[iF]!+previous[iI]!);
      return {...p,score:momentum,reason:'동반 순매수 유지 및 전일 대비 순매수 가속(억원)'};
    }).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,10)
  };
  const market=await db<{trade_date:string;snapshot:unknown}[]>('market_daily?select=trade_date,snapshot&trade_date=lte.'+latest.date+'&order=trade_date.desc&limit=1');
  for(const strategy of strategies)if(!existing.some(s=>s.strategy===strategy)){
    await store('balta_ai_signals',{trade_date:date,strategy,source_date:latest.date,source_observed_at:latest.observed_at,source_snapshot:{dates:rows.map(r=>r.date),universe_date:latest.universe_date,signal:'long_only_positive_dual_flow'},market_snapshot:market[0]??{},picks:selections[strategy]},'trade_date,strategy');
  }
  await runLog(date,'morning','complete',{candidates:ranked.length,signals:Object.fromEntries(strategies.map(s=>[s,selections[s].length])),source_date:latest.date});
  console.log(JSON.stringify({date,phase:'morning',sourceDate:latest.date,signals:selections},null,2));
}
async function close(date:string){
  // The next-day/3-day/5-day marks are evaluated only after the required number
  // of actual market observations. Missing closes remain pending, never zero.
  const signals=await db<Signal[]>('balta_ai_signals?select=trade_date,strategy,source_date,source_observed_at,generated_at,picks&trade_date=lte.'+date+'&order=trade_date.desc&limit=15');
  const dates=[...new Set(signals.map(s=>s.trade_date))];
  let inserted=0,pending=0;
  const cache=new Map<string,ReturnType<typeof parseStockBars>>();
  for(const signal of signals){
    for(const pick of signal.picks){
      if(!cache.has(pick.code)){
        try{
          const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
            FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:pick.code,FID_INPUT_DATE_1:signal.trade_date.replaceAll('-',''),
            FID_INPUT_DATE_2:date.replaceAll('-',''),FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'
          },0);
          cache.set(pick.code,parseStockBars(outputRows(body.output2)));
        }catch{cache.set(pick.code,[]);}
      }
      const bars=cache.get(pick.code)!.filter(x=>x.date>=signal.trade_date&&x.date<=date);
      const entry=bars.find(b=>b.date===signal.trade_date);
      if(!entry){pending+=4;continue;}
      for(const horizon of [0,1,3,5]){
        const exit=bars[horizon];
        if(!exit||exit.date>date){pending++;continue;}
        // Adjusted open-to-close paper trade, no fill guarantees or intraday claims.
        const returnPct=(exit.close/entry.open-1)*100;
        await store('balta_ai_outcomes',{trade_date:signal.trade_date,strategy:signal.strategy,stock_code:pick.code,horizon,entry_date:entry.date,exit_date:exit.date,entry_open:entry.open,exit_close:exit.close,return_pct:Number(returnPct.toFixed(6)),source:'KIS_DAILY_ADJUSTED'},'trade_date,strategy,stock_code,horizon');
        inserted++;
      }
    }
  }
  await runLog(date,'close',pending?'incomplete':'complete',{signals:signals.length,attempted:inserted,pending,dates});
  console.log(JSON.stringify({date,phase:'close',attempted:inserted,pending}));
}
async function main(){
  const now=kstParts(),phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8);
  if(!['morning','close'].includes(phase??''))throw Error('Use --phase=morning or --phase=close');
  const closed=marketClosedReason(now.date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
  if(closed){console.log('Market closed:',closed);return;}
  if(phase==='morning'&&now.time>='09:00')throw Error('Morning signal cutoff is 09:00 KST');
  if(phase==='close'&&now.time<'16:30')throw Error('Closing evaluation begins at 16:30 KST');
  if(phase==='morning')await morning(now.date);else await close(now.date);
}
main().catch(e=>{console.error('[balta-ai]',e instanceof Error?e.message:e);process.exitCode=1;});

import {db} from './member-store';
import {kisTerminal,outputRows} from './kis-terminal';
import {predictionWindow} from './prediction-model';
import {stockClosingPair} from './stock-prediction-model';
import {marketClosedReason,parseAdditionalHolidays} from './market-calendar';
// A member page settles that member's backlog; the daily job sweeps all members.
const running=new Map<string,Promise<void>>(),last=new Map<string,number>();
export async function settleStockPredictions(memberId?:string){
 const scope=memberId??'all';
 if(running.has(scope))return running.get(scope);
 if(Date.now()-(last.get(scope)??0)<60000)return;
 const task=(async()=>{
  const state=predictionWindow();
  const pending=await db<{day:string;code:string}[]>('balta_stock_predictions?result=is.null&day=lte.'+state.day+(memberId?'&member_id=eq.'+memberId:'')+'&select=day,code&order=day.desc,code.asc&limit=1000');
  const keys=[...new Set(pending.map(p=>p.day+':'+p.code))];
  const start=Date.now();
  for(const key of keys){
   if(Date.now()-start>25000)break;
   const [day,code]=key.split(':');
   if(day===state.day&&state.time<'16:00'||marketClosedReason(day,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)))continue;
   const date=day.replaceAll('-','');
   const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:date,FID_INPUT_DATE_2:date,FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'},60000);
   const pair=stockClosingPair(outputRows(body.output2),day);
   if(pair)await db('rpc/balta_settle_stock_predictions','POST',{p_day:day,p_code:code,p_open:pair.opening,p_close:pair.closing});
  }
  if(last.size>2000)last.clear();
  last.set(scope,Date.now());
 })().finally(()=>running.delete(scope));
 running.set(scope,task);return task;
}

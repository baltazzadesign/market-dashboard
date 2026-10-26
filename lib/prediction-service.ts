import {db} from './member-store';
import {kisTerminal,outputRows} from './kis-terminal';
import {parseAdditionalHolidays,marketClosedReason} from './market-calendar';
import {predictionWindow,closingPair} from './prediction-model';
let running:Promise<void>|null=null,last=0;
export async function settlePredictions(){
 if(running)return running;
 if(Date.now()-last<60000)return;
 running=(async()=>{
  const window=predictionWindow();
  const pending=await db<{day:string;market:string}[]>('balta_predictions?result=is.null&day=lte.'+window.day+'&select=day,market&order=day.asc&limit=1000');
  const keys=[...new Set(pending.map(p=>p.day+':'+p.market))].slice(0,6);
  for(const key of keys){
   const [day,market]=key.split(':');
   if(day===window.day&&window.time<'16:00'||marketClosedReason(day,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)))continue;
   const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','FHPUP02120000',{FID_PERIOD_DIV_CODE:'D',FID_COND_MRKT_DIV_CODE:'U',FID_INPUT_ISCD:market==='kospi'?'0001':'1001',FID_INPUT_DATE_1:day.replaceAll('-','')},60000);
   const pair=closingPair(outputRows(body.output2),day);
   if(pair)await db('rpc/balta_settle_predictions','POST',{p_day:day,p_market:market,p_close:pair.close,p_previous:pair.previous});
  }
  last=Date.now();
 })().finally(()=>{running=null;});
 return running;
}

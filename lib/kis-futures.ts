import { unzipSync } from 'fflate';
import { kisTerminal, outputRows } from './kis-terminal';
import { FUTURES_SESSION, addDate, contractTradable, kstParts, type FutureCalendar } from './futures-session';
import { normalizedDate, parseMaster, parseQuote, parseRestBar, type FutureBar, type FutureContract, type FutureProduct, type FutureRange } from './futures-model';
import { storedContracts } from './futures-store';
export const FUTURES_KIS = {
  price:{path:'/uapi/domestic-futureoption/v1/quotations/inquire-price',tr:'FHMIF10000000'},
  minute:{path:'/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice',tr:'FHKIF03020200'},
  daily:{path:'/uapi/domestic-futureoption/v1/quotations/inquire-daily-fuopchartprice',tr:'FHKIF03020100'},
  dayTrade:'H0IFCNT0',dayAsk:'H0IFASP0',nightTrade:'H0MFCNT0',nightAsk:'H0MFASP0',
  master:'https://new.real.download.dws.co.kr/common/master/fo_idx_code_mts.mst.zip',
} as const;
type MasterRow=ReturnType<typeof parseMaster>[number];
let master:{until:number;pending:Promise<MasterRow[]>}|null=null;
async function directory(force=false) {
  if(!force&&master&&master.until>Date.now())return master.pending;
  const pending=(async()=>{
    const response=await fetch(FUTURES_KIS.master,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('선물 종목 목록을 받지 못했습니다.');
    const zip=unzipSync(new Uint8Array(await response.arrayBuffer()));const file=zip['fo_idx_code_mts.mst'];
    if(!file||file.length>15000000)throw Error('선물 종목 목록 형식 오류');
    const rows=parseMaster(new TextDecoder('euc-kr').decode(file));
    if(!rows.some(r=>r.product==='kospi200')||!rows.some(r=>r.product==='kosdaq150'))throw Error('선물 기초자산 목록을 확인하지 못했습니다.');
    return rows;
  })();
  master={until:Date.now()+1800000,pending};try{return await pending;}catch(e){master={until:Date.now()+30000,pending};throw e;}
}
const fronts=new Map<FutureProduct,{until:number;pending:Promise<FutureContract>}>();
export async function resolveFront(product:FutureProduct,now=new Date(),force=false):Promise<FutureContract> {
  const cached=fronts.get(product);
  if(!force&&cached&&cached.until>Date.now()){
    const value=await cached.pending;if(contractTradable(value.expiry,now))return value;
  }
  const pending=(async()=>{
    try {
      const candidates=(await directory()).filter(r=>r.product===product).sort((a,b)=>a.month_rank-b.month_rank);
      for(const item of candidates.slice(0,3)) {
        const b=await rawPrice(item.contract_code,60000);const row=outputRows(b.output1)[0]??{};
        const expiry=normalizedDate(row.futs_last_tr_date);
        if(expiry&&contractTradable(expiry,now))return {...item,expiry,verified_at:now.toISOString()};
      }
      throw Error('거래 가능한 최근월물을 확인하지 못했습니다.');
    } catch(error) {
      // Never invent a contract after a failed directory/auth call. Bounded last-known metadata only.
      const known=await storedContracts(product).catch(()=>[]);
      const valid=known.filter(r=>contractTradable(r.expiry,now)&&Date.parse(r.verified_at)>now.getTime()-24*3600000).sort((a,b)=>a.expiry.localeCompare(b.expiry));
      if(valid[0])return valid[0];throw error;
    }
  })();fronts.set(product,{until:Date.now()+300000,pending});
  try{return await pending;}catch(e){fronts.set(product,{until:Date.now()+15000,pending});throw e;}
}
export function rawPrice(code:string,ttl=10000){const a=FUTURES_KIS.price;return kisTerminal(a.path,a.tr,{FID_COND_MRKT_DIV_CODE:'F',FID_INPUT_ISCD:code},ttl);}
export async function dayQuote(contract:FutureContract,calendar:FutureCalendar={}) {
  const body=await rawPrice(contract.contract_code),now=new Date().toISOString();
  return parseQuote(outputRows(body.output1)[0]??{},contract,'DAY',now,'REST',calendar);
}
export async function minuteBars(contract:FutureContract,date:string,calendar:FutureCalendar={},pages=5) {
  let hour=FUTURES_SESSION.dayClose.replace(':','')+'00';const bars=new Map<string,FutureBar>();const a=FUTURES_KIS.minute;
  for(let i=0;i<Math.min(5,pages);i++) {
    const b=await kisTerminal(a.path,a.tr,{FID_COND_MRKT_DIV_CODE:'F',FID_INPUT_ISCD:contract.contract_code,FID_HOUR_CLS_CODE:'60',FID_PW_DATA_INCU_YN:'Y',FID_FAKE_TICK_INCU_YN:'N',FID_INPUT_DATE_1:date.replaceAll('-',''),FID_INPUT_HOUR_1:hour},30000);
    const raw=outputRows(b.output2);if(!raw.length)break;
    const parsed=raw.map(r=>parseRestBar(r,contract,true,calendar)).filter((r):r is FutureBar=>!!r&&r.trading_date===date);
    for(const bar of parsed)bars.set(bar.timestamp,bar);
    const oldest=raw.map(r=>({date:normalizedDate(r.stck_bsop_date),hour:String(r.stck_cntg_hour??'')})).filter(r=>r.date&&/^\d{6}$/.test(r.hour)).sort((a,b)=>(a.date!+a.hour).localeCompare(b.date!+b.hour))[0];
    if(!oldest||oldest.date!==date||oldest.hour>=hour||oldest.hour<=FUTURES_SESSION.dayOpen.replace(':','')+'00')break;
    const h=Number(oldest.hour.slice(0,2)),m=Number(oldest.hour.slice(2,4)),s=Number(oldest.hour.slice(4,6));const t=h*3600+m*60+s-1;
    hour=String(Math.floor(t/3600)).padStart(2,'0')+String(Math.floor(t%3600/60)).padStart(2,'0')+String(t%60).padStart(2,'0');
  }
  return [...bars.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
export const rangeDays:Record<FutureRange,number>={'1D':1,'1W':7,'1M':31,'3M':93,'1Y':366};
export async function dailyBars(contract:FutureContract,range:FutureRange,date:string,calendar:FutureCalendar={}) {
  const start=addDate(date,-rangeDays[range]),a=FUTURES_KIS.daily;let end=date;const bars=new Map<string,FutureBar>();
  for(let i=0;i<4;i++) {
    const b=await kisTerminal(a.path,a.tr,{FID_COND_MRKT_DIV_CODE:'F',FID_INPUT_ISCD:contract.contract_code,FID_INPUT_DATE_1:start.replaceAll('-',''),FID_INPUT_DATE_2:end.replaceAll('-',''),FID_PERIOD_DIV_CODE:'D'},300000);
    const raw=outputRows(b.output2);const rows=raw.map(r=>parseRestBar(r,contract,false,calendar)).filter((r):r is FutureBar=>!!r&&r.trading_date>=start&&r.trading_date<=date);
    for(const r of rows)bars.set(r.trading_date,r);
    const oldest=rows.map(r=>r.trading_date).sort()[0];if(!oldest||oldest<=start||raw.length<100)break;
    const next=addDate(oldest,-1);if(next>=end)break;end=next;
  }
  return [...bars.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}

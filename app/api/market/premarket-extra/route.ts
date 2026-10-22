import {hasDashboardAccess} from '@/lib/balta-access';
import {kisTerminal} from '@/lib/kis-terminal';
import {bitcoinQuote,marketFunds,treasuryTwoYear,yahooQuote} from '@/lib/premarket-extra-model';
import {parseMorningSeries,type MorningQuote} from '@/lib/premarket-model';
export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
let cached:{until:number;pending:Promise<MorningQuote[]>}|undefined;
async function get(url:string){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('provider unavailable');return response;}
async function load(){
 const jobs:[string,string,string,string,()=>Promise<MorningQuote[]>][]=[
  ...[['DX-Y.NYB','달러인덱스 · DXY','환율'],['^RUT','러셀2000','주요 지수'],['YM=F','다우 선물','해외 선물']].map(([id,name,group])=>[id,name,group,'pt',async()=>[yahooQuote(id,name,group,await(await get('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(id)+'?interval=1d&range=1mo')).json())]] as [string,string,string,string,()=>Promise<MorningQuote[]>]),
  ['UST2Y','미국채 2년 수익률','금리·위험','%',async()=>{
   const year=new Date().getUTCFullYear();const xml=await Promise.all([year-1,year].map(y=>get('https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value='+y).then(r=>r.text())));return [treasuryTwoYear(xml.join('\n'))];}],
  ['KRW-BTC','비트코인 · 업비트','원자재·대체자산','KRW',async()=>[bitcoinQuote(await(await get('https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=30')).json())]],
  ['DEPOSIT','투자자예탁금','증시 자금','조원',async()=>marketFunds((await kisTerminal('/uapi/domestic-stock/v1/quotations/mktfunds','FHKST649100C0',{FID_INPUT_DATE_1:''},300000)).output)],
 ];
 return (await Promise.all(jobs.map(async([id,name,group,unit,run])=>{try{return await run();}catch{
  const rows=[{...parseMorningSeries(id,name,group,unit,[]),note:'제공처 연결 실패 · 잠시 후 다시 조회해 주세요.'}];
  if(id==='DEPOSIT')rows.push({...parseMorningSeries('CREDIT','신용융자잔고','증시 자금','조원',[]),note:'제공처 연결 실패 · 잠시 후 다시 조회해 주세요.'});return rows;
 }}))).flat();
}
export async function GET(request:Request){
 if(!await hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
 if(!cached||cached.until<Date.now()){const pending=load();cached={until:Date.now()+300000,pending};pending.then(rows=>{if(cached?.pending===pending&&rows.some(r=>r.price===null))cached.until=Date.now()+30000;},()=>{if(cached?.pending===pending)cached=undefined;});}
 return Response.json({ok:true,rows:await cached.pending,fetchedAt:new Date().toISOString()},{headers});
}

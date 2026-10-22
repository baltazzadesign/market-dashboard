import {parseMorningSeries,type MorningQuote} from './premarket-model';
export function datedQuote(id:string,name:string,group:string,unit:string,rows:{date:string;value:unknown}[],source:string,sourceUrl:string,note:string):MorningQuote{
 return {...parseMorningSeries(id,name,group,unit,rows.map(r=>({stck_bsop_date:r.date.replaceAll('-',''),ovrs_nmix_prpr:r.value}))),source,sourceUrl,note};
}
export function yuanCross(krw:MorningQuote,cny:MorningQuote){
 const byDate=new Map(cny.points.map(p=>[p.date,p.value]));
 return datedQuote('CNYKRW','위안/원','환율','KRW/1 CNY',krw.points.flatMap(p=>{const v=byDate.get(p.date);return v&&v>0?[{date:p.date,value:p.value/v}]:[];}),'KIS · 동일 영업일 교차환율','https://apiportal.koreainvestment.com','달러/원 ÷ 달러/위안 · 두 환율의 공통 기준일만 계산');
}
export function treasuryTwoYear(xml:string){
 const rows=[...xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)].flatMap(m=>{
  const date=m[1].match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/)?.[1],value=m[1].match(/<d:BC_2YEAR[^>]*>([\d.]+)<\/d:BC_2YEAR>/)?.[1];return date&&value?[{date,value}]:[];
 });
 return datedQuote('UST2Y','미국채 2년 수익률','금리·위험','%',rows,'미 재무부','https://home.treasury.gov/resource-center-data-chart-center/interest-rates','일별 파 수익률 · 미국 영업일 · 실시간 국채 호가 아님');
}
export function marketFunds(raw:unknown){
 return [['DEPOSIT','투자자예탁금','cust_dpmn_amt'],['CREDIT','신용융자잔고','crdt_loan_rmnd']].map(([id,name,key])=>datedQuote(id,name,'증시 자금','조원',(Array.isArray(raw)?raw:[]).flatMap(r=>{const raw=r[key],value=typeof raw==='string'&&raw.trim()?Number(raw.replaceAll(',','')):NaN;return Number.isFinite(value)?[{date:String(r.bsop_date??''),value:value/10000}]:[];}),'금융투자협회 · KIS','https://securities.koreainvestment.com/pro_help/6492.html','공표된 잔액 기준 · 원자료 억원을 조원으로 환산 · 발표 지연 가능'));
}
export function yahooQuote(id:string,name:string,group:string,body:unknown){
 const data=(body as {chart?:{result?:{meta?:{exchangeTimezoneName?:string};timestamp?:number[];indicators?:{quote?:{close?:unknown[]}[]}}[]}})?.chart?.result?.[0];
 const tz=data?.meta?.exchangeTimezoneName||'America/New_York';
 const rows=(data?.timestamp??[]).flatMap((timestamp,i)=>{const value=data?.indicators?.quote?.[0]?.close?.[i];if(!Number.isFinite(timestamp)||timestamp<=0)return [];const date=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp*1000));return [{date,value}];});
 return datedQuote(id,name,group,'pt',rows,'Yahoo Finance','https://finance.yahoo.com/quote/'+encodeURIComponent(id)+'/','거래소 현지 일자 · 지연 시세 · 최근 일봉은 진행 중일 수 있음');
}
export function bitcoinQuote(raw:unknown){
 const rows=(Array.isArray(raw)?raw:[]).filter(r=>r.market==='KRW-BTC').map(r=>({date:String(r.candle_date_time_kst??'').slice(0,10),value:r.trade_price}));
 return datedQuote('KRW-BTC','비트코인 · 업비트','원자재·대체자산','KRW',rows,'업비트','https://upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC','한국시간 오전 9시 시작 일봉 · 최근 일봉은 진행 중 · 업비트 원화 시장 가격');
}

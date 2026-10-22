import {finite} from './terminal-model';
export type MorningPoint={date:string;value:number};
export type MorningQuote={id:string;name:string;group:string;unit:string;price:number|null;rate:number|null;change:number|null;date:string|null;points:MorningPoint[];note?:string;source?:string;sourceUrl?:string};
export const overseasAssets=[
 ['EWY','한국 ETF · EWY','한국 관련','AMS'],['KORU','한국 3배 ETF · KORU','한국 관련','AMS'],['SKHY','SK하이닉스 ADR · SKHY','한국 관련','NAS'],
 ...[['NVDA','엔비디아'],['MU','마이크론'],['AMD','AMD'],['AVGO','브로드컴'],['ASML','ASML'],['INTC','인텔'],['AAPL','애플'],['MSFT','마이크로소프트'],['GOOGL','알파벳'],['AMZN','아마존'],['META','메타'],['TSLA','테슬라']].map(([id,name])=>[id,name,'미국 주요 종목','NAS'])
] as string[][];
export const globalAssets=[
 ['EDNH','S&P500 선물','해외 선물','N','pt'],['ENXH','나스닥100 선물','해외 선물','N','pt'],
 ['.DJI','다우','주요 지수','N','pt'],['SPX','S&P500','주요 지수','N','pt'],['COMP','나스닥','주요 지수','N','pt'],['SOX','필라델피아 반도체','주요 지수','N','pt'],['GR#DAX','독일 DAX','주요 지수','N','pt'],['JP#NI225','닛케이225','주요 지수','N','pt'],
 ['VIX','VIX','금리·위험','N','pt'],['Y0201','미국채 30년 수익률','금리·위험','I','%'],['Y0202','미국채 10년 수익률','금리·위험','I','%'],
 ['WTIF','WTI 원유 근월','원자재','N','USD/배럴'],['BRENTF','브렌트유 근월','원자재','N','USD/배럴'],['NYGOLD','COMEX 금','원자재','N','USD/온스'],['NYSILV','COMEX 은','원자재','N','USD/온스'],['LMECOC','LME 구리 현물','원자재','N','USD/톤'],
 ['FX@KRW','달러/원','환율','X','KRW'],['FX@JPY','달러/엔','환율','X','JPY'],['FX@CNY','달러/위안','환율','X','CNY/1 USD']
] as string[][];
export function parseMorningSeries(id:string,name:string,group:string,unit:string,raw:unknown,stock=false):MorningQuote{
 const points:MorningPoint[]=[];const seen=new Set<string>();
 for(const row of Array.isArray(raw)?raw:[]){const date=String(row[stock?'xymd':'stck_bsop_date']??''),value=finite(row[stock?'clos':'ovrs_nmix_prpr']);
  if(!/^\d{8}$/.test(date)||!value||value<=0||seen.has(date))continue;
  const formatted=date.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
  const stamp=Date.parse(formatted+'T00:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==formatted)continue;
  seen.add(date);points.push({date:formatted,value});
 }
 points.sort((a,b)=>a.date.localeCompare(b.date));const last=points.at(-1),previous=points.at(-2);
 return {id,name,group,unit,price:last?.value??null,rate:last&&previous?(last.value/previous.value-1)*100:null,change:last&&previous?last.value-previous.value:null,date:last?.date??null,points:points.slice(-30)};
}

import {stockDate} from './stock-flow-model';

export type StockDisclosure={receipt:string;date:string;name:string;filer:string;correction:boolean;hasCorrection:boolean;withdrawn:boolean};
export type StockDisclosureResponse={ok:true;code:string;corpCode:string;name:string;start:string;end:string;fetchedAt:string;items:StockDisclosure[];total:number;partial:boolean;warnings:string[]};
export type StockDisclosureDay={date:string;items:StockDisclosure[]};
export type StockDisclosureMarker={index:number;throughIndex:number;dates:string[];items:StockDisclosure[]};
export function stockDisclosureUrl(receipt:string){return /^\d{14}$/.test(receipt)?'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt:undefined;}
export function parseStockDisclosures(input:unknown[],corpCode:string,start:string,end:string){
  const unique=new Map<string,StockDisclosure>();
  for(const value of input){
    if(!value||typeof value!=='object')continue;
    const r=value as Record<string,unknown>,receipt=String(r.rcept_no??''),date=stockDate(r.rcept_dt),name=typeof r.report_nm==='string'?r.report_nm.trim():'';
    if(String(r.corp_code)!==corpCode||!stockDisclosureUrl(receipt)||!date||date<start||date>end||!name)continue;
    const remark=String(r.rm??'');
    unique.set(receipt,{receipt,date,name,filer:typeof r.flr_nm==='string'?r.flr_nm:'',correction:/^\[[^\]]*정정[^\]]*\]/.test(name),hasCorrection:remark.includes('정'),withdrawn:remark.includes('철')||/철회/.test(name)});
  }
  return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.receipt.localeCompare(a.receipt));
}
// Reception date is a calendar date, not an intraday publication timestamp.
// A missing candle maps forward only; never place a filing on an earlier day.
export function alignStockDisclosures(dates:string[],items:StockDisclosure[]):StockDisclosureDay[]{
  const days=dates.map(date=>({date,items:[] as StockDisclosure[]}));
  for(const item of items){
    if(!dates.length||item.date<dates[0])continue;
    let lo=0,hi=dates.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(dates[mid]<item.date)lo=mid+1;else hi=mid;}
    if(lo<days.length)days[lo].items.push(item);
  }
  return days;
}
// Group dense markers by distance from the first candle, not the previous
// candle, so a continuous run of filing days cannot collapse into one marker.
export function clusterStockDisclosures(days:StockDisclosureDay[],plotWidth:number):StockDisclosureMarker[]{
  const markers:StockDisclosureMarker[]=[],gap=28;
  days.forEach((day,index)=>{
    if(!day.items.length)return;
    const last=markers.at(-1);
    if(last&&(index-last.index)*plotWidth/Math.max(1,days.length)<gap){last.throughIndex=index;last.dates.push(day.date);last.items.push(...day.items);}
    else markers.push({index,throughIndex:index,dates:[day.date],items:[...day.items]});
  });
  return markers;
}

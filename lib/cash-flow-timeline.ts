// Pure disclosure timeline. A daily chart may use a filing only AFTER its date.
import { emptyYear, type Basis } from './cash-flow-model';
import { analyzeQuarters, ordinal, quarterId, quarterLabel, type CashFlowQuarter, type Quarter, type QuarterCashFlowResponse } from './cash-flow-quarter';

export type CashFlowView = 'quarter' | 'ttm';
export type CashDisclosure = { receipt:string; date:string; year:number; quarter:Quarter; label:string; name:string; correction:boolean; withdrawn:boolean; superseded:boolean };
export type CashMetrics = { operating:number|null; fcf:number|null; conversion:number|null };
export type CashTimelineEvent = {
  date:string; filings:CashDisclosure[]; period:string; label:string; basis:Basis;
  quarter:CashMetrics; ttm:CashMetrics; ttmLabel:string;
  yoyOperating:number|null; yoyFcf:number|null; reason:string;
  sources:CashDisclosure[];
};
export type CashTimelineResponse = {
  ok:true; code:string; name:string; basis:Basis; fetchedAt:string;
  events:CashTimelineEvent[]; warnings:string[];
};
export type CashTimelineDay = { date:string; event:CashTimelineEvent|null; filings:CashDisclosure[] };
export function filingDate(value:unknown):string|null {
  const raw=String(value??'').replaceAll('-','');
  if(!/^\d{8}$/.test(raw))return null;
  const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`,time=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date?date:null;
}
export function parseDisclosures(input:unknown,corpCode:string):CashDisclosure[] {
  if(!Array.isArray(input))return [];
  const found=new Map<string,CashDisclosure>();
  for(const raw of input){
    if(!raw||typeof raw!=='object')continue;
    const r=raw as Record<string,unknown>,name=String(r.report_nm??''),receipt=String(r.rcept_no??'');
    const match=name.match(/(사업|반기|분기)보고서\s*\((\d{4})\.(\d{2})\)/),date=filingDate(r.rcept_dt);
    if(String(r.corp_code??'')!==corpCode||!match||!date||!/^\d{14}$/.test(receipt))continue;
    const month=Number(match[3]),year=Number(match[2]);
    const quarter:Quarter|null=match[1]==='사업'&&month===12?4:match[1]==='반기'&&month===6?2:match[1]==='분기'&&month===3?1:match[1]==='분기'&&month===9?3:null;
    if(!quarter)continue;
    found.set(receipt,{receipt,date,year,quarter,label:quarterLabel(year,quarter),name,correction:/정정|첨부추가|변경/.test(name),withdrawn:String(r.rm??'').includes('철'),superseded:String(r.rm??'').includes('정')});
  }
  return [...found.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.receipt.localeCompare(b.receipt));
}
const nullMetrics=():CashMetrics=>({operating:null,fcf:null,conversion:null});
const metrics=(q:CashFlowQuarter|undefined):CashMetrics=>q?{operating:q.operating,fcf:q.fcf,conversion:q.conversion}:nullMetrics();
const rank=(q:{year:number;quarter:Quarter})=>ordinal(q.year,q.quarter);

export function buildCashTimeline(data:QuarterCashFlowResponse,filings:CashDisclosure[]):CashTimelineResponse {
  const sorted=[...data.quarters].sort((a,b)=>rank(a)-rank(b));
  if(!sorted.length)return {ok:true,code:data.code,name:data.name,basis:data.basis,fetchedAt:data.fetchedAt,events:[],warnings:[...data.warnings]};
  const first=sorted[0],target=data.expectedPeriod.match(/^(\d{4})-Q([1-4])$/);
  const max=target?ordinal(Number(target[1]),Number(target[2]) as Quarter):rank(sorted.at(-1)!);
  const relevant=first?filings.filter(f=>rank(f)>=rank(first)&&rank(f)<=max):[];
  const byReceipt=new Map(filings.map(f=>[f.receipt,f]));
  const dates=[...new Set(relevant.map(f=>f.date))].sort();
  const dependencies=(q:CashFlowQuarter):CashDisclosure[]|null=>{
    if(q.status!=='ok'||!q.receipt||q.quarter>1&&!q.previousReceipt)return null;
    const current=byReceipt.get(q.receipt),previous=q.previousReceipt?byReceipt.get(q.previousReceipt):undefined;
    if(!current||rank(current)!==rank(q)||q.quarter>1&&(!previous||rank(previous)!==rank(q)-1||previous.year!==q.year))return null;
    return previous?[current,previous]:[current];
  };
  // Latest numeric values cannot reconstruct older versions. Keep those intervals
  // empty, including when a new correction has appeared but financial cache lags.
  const usable=(q:CashFlowQuarter,date:string)=>{
    const deps=dependencies(q);if(!deps)return false;
    return deps.every(d=>{
      if(d.withdrawn||d.superseded||d.date>date)return false;
      const latest=filings.filter(f=>rank(f)===rank(d)&&f.date<=date).at(-1);
      return latest?.receipt===d.receipt;
    });
  };
  const events:CashTimelineEvent[]=dates.map(date=>{
    const publicReports=relevant.filter(f=>f.date<=date);
    const latest=publicReports.reduce((a,b)=>rank(b)>rank(a)?b:a);
    const period=quarterId(latest.year,latest.quarter);
    const masked=sorted.filter(q=>rank(q)<=rank(latest)).map(q=>usable(q,date)?q:{...q,...emptyYear(q.year,q.basis),receipt:q.receipt,previousReceipt:q.previousReceipt});
    if(!masked.some(q=>q.period===period))masked.push({...emptyYear(latest.year,data.basis),quarter:latest.quarter,period,label:latest.label,previousReceipt:null,calculation:'',reported:true});
    const q=masked.at(-1)!,analysis=analyzeQuarters(masked,false);
    const sources=[...new Map(masked.slice(-4).filter(r=>r.status==='ok').flatMap(r=>dependencies(r)??[]).map(f=>[f.receipt,f])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    const ready=q.status==='ok';
    return {date,filings:relevant.filter(f=>f.date===date),period,label:latest.label,basis:data.basis,quarter:metrics(q),ttm:{operating:analysis.ttm.operating,fcf:analysis.ttm.fcf,conversion:analysis.ttm.conversion},ttmLabel:analysis.ttm.label,yoyOperating:analysis.yoy.operating,yoyFcf:analysis.yoy.fcf,reason:ready?'': '공시는 확인됐지만 해당 시점의 비교 가능한 수치를 확인하지 못했습니다. 정정 전 수치·직전 공시·누락 계정을 확인해 주세요.',sources};
  });
  const warnings=[...data.warnings];
  if(sorted.some(q=>q.status==='ok'&&!dependencies(q)))warnings.push('일부 재무제표와 공시 접수번호를 연결하지 못해 해당 값은 표시하지 않습니다.');
  if(relevant.some(f=>f.correction||f.superseded||f.withdrawn))warnings.push('정정·철회 이력이 있는 기간은 당시 원본 수치를 확인할 수 없으면 비워둡니다. 현재 정정값을 과거에 소급하지 않습니다.');
  return {ok:true,code:data.code,name:data.name,basis:data.basis,fetchedAt:data.fetchedAt,events,warnings};
}
export function alignCashTimeline(dates:string[],events:CashTimelineEvent[]):CashTimelineDay[] {
  const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date));
  let cursor=0,known:CashTimelineEvent|null=null;
  return dates.map(date=>{
    const filings:CashDisclosure[]=[];
    while(cursor<sorted.length&&sorted[cursor].date<date){
      known=sorted[cursor++];
      if(known.date>=dates[0])filings.push(...known.filings);
    }
    return {date,event:known,filings};
  });
}
export function cashStepPaths(days:CashTimelineDay[],view:CashFlowView,key:'operating'|'fcf',x:(i:number)=>number,y:(v:number)=>number):string[] {
  const paths:string[]=[];let path='',last:number|null=null;
  days.forEach((day,i)=>{
    const value=day.event?.[view][key]??null;
    if(value===null){if(path){if(i>0)path+=` H${x(i-.5)}`;paths.push(path);}path='';last=null;return;}
    if(last===null)path=`M${x(i)},${y(value/1e8)}`;
    else path+=` H${x(i)} V${y(value/1e8)}`;
    last=value;
  });
  if(path)paths.push(path);
  return paths;
}
export const cashAmount=(value:number|null|undefined,signed=false)=>value==null?'—':(signed&&value>0?'+':'')+(value/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1});
export const disclosureUrl=(receipt:string)=>'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt;

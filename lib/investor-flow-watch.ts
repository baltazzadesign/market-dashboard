import { marketClosedReason } from './market-calendar';
import { stockDate } from './stock-flow-model';
import { investorLabel, rankingMarketLabels, type RankingMarket, type RankingStock } from './investor-ranking';
import type { StockInvestor } from './stock-flow-model';
import type { InvestorHistorySession } from './investor-flow-history';

export const flowWatchKinds=['buying','exit','reentry'] as const;
export type FlowWatchKind=typeof flowWatchKinds[number];
export const flowWatchLabels={buying:'연속 순매수',exit:'매수 이탈',reentry:'이탈 후 재매수'};
export type FlowWatchCriteria={minimumDays:number;reentryWindow:number;minimumAmount:number};
export const defaultFlowWatchCriteria:FlowWatchCriteria={minimumDays:3,reentryWindow:10,minimumAmount:0};
export type FlowRun={days:number;total:number;start:string;exact:boolean};
export type FlowWatchEvent=RankingStock & {
  kind:FlowWatchKind;date:string;net:number;run:FlowRun;previousRun:FlowRun|null;
  exitDate:string|null;gapDays:number|null;soldAmount:number|null;reentryRatio:number|null;
  sellRatio:number|null;fiveDayNet:number|null;trail:{date:string;net:number|null}[];newStreak:boolean;
};
export type FlowDaySummary={
  date:string;status:'ready'|'partial'|'uncollected'|'closed'|'future';reason:string|null;
  expected:number;covered:number;undetermined:number;counts:Record<FlowWatchKind,number>;
  backfilled:boolean;observedAt:string|null;
};
export type FlowWatchReport={
  ok:true;month:string;selectedDate:string;investor:StockInvestor;market:RankingMarket;criteria:FlowWatchCriteria;
  days:FlowDaySummary[];selected:FlowDaySummary;events:FlowWatchEvent[];historyStart:string|null;historyEnd:string|null;warnings:string[];
};
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const validFlowMonth=(value:string)=>/^\d{4}-\d{2}$/.test(value)&&stockDate(value+'-01')===value+'-01';
export function flowMonthEnd(month:string){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);}
export function shiftFlowMonth(month:string,delta:number){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);}
export function validFlowCriteria(c:FlowWatchCriteria){return [2,3,5,10].includes(c.minimumDays)&&[3,5,10].includes(c.reentryWindow)&&[0,1,5,10,50,100].includes(c.minimumAmount);}
const zeroCounts=():Record<FlowWatchKind,number>=>({buying:0,exit:0,reentry:0});
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);

export function inspectFlowSeries(stock:RankingStock,dates:string[],values:(number|null)[],index:number,criteria:FlowWatchCriteria):{event:FlowWatchEvent|null;undetermined:boolean}{
  const net=values[index];if(!finite(net))return {event:null,undetermined:true};
  // Never access values beyond index: every historical signal is an as-of calculation.
  function buyRun(end:number):FlowRun{
    let i=end,total=0;while(i>=0&&finite(values[i])&&values[i]!>0){total+=values[i]!;i--;}
    return {days:end-i,total,start:dates[i+1]??dates[index],exact:i>=0&&finite(values[i])};
  }
  const current=net>0?buyRun(index):{days:0,total:0,start:dates[index],exact:true};
  let kind:FlowWatchKind|null=null,previous:FlowRun|null=null,exitDate:string|null=null,gapDays:number|null=null,soldAmount:number|null=null,undetermined=false;
  if(net>0&&current.days>=criteria.minimumDays)kind='buying';
  else if(net<0){
    previous=buyRun(index-1);
    if(previous.days>=criteria.minimumDays)kind='exit';
    else undetermined=!previous.exact;
  }else if(net>0&&current.days===1){
    // First positive day only. The uninterrupted non-positive interval must start
    // with an actual sell day immediately after the qualifying buying run.
    let i=index-1,sold=0;
    while(i>=0&&index-i<=criteria.reentryWindow&&finite(values[i])&&values[i]!<=0){sold+=Math.min(values[i]!,0);i--;}
    const gap=index-i-1;
    if(gap>0&&gap<=criteria.reentryWindow&&i>=0&&finite(values[i])&&values[i]!>0){
      previous=buyRun(i);
      if(values[i+1]!<0&&previous.days>=criteria.minimumDays){kind='reentry';exitDate=dates[i+1];gapDays=gap;soldAmount=-sold;}
      else if(values[i+1]!<0)undetermined=!previous.exact;
    }else if(gap<=criteria.reentryWindow&&(i<0||!finite(values[i])))undetermined=true;
  }else if(net>0)undetermined=!current.exact;
  // A zero flow is a neutral pause, not proof of selling or a missing observation.
  if(!kind||Math.abs(net)<criteria.minimumAmount)return {event:null,undetermined};
  const recent=values.slice(Math.max(0,index-4),index+1);
  const fiveDayNet=recent.length===5&&recent.every(finite)?recent.reduce<number>((sum,v)=>sum+v!,0):null;
  return {undetermined:false,event:{...stock,kind,date:dates[index],net,run:current,previousRun:previous,
    exitDate:kind==='exit'?dates[index]:exitDate,gapDays,soldAmount:kind==='exit'?-net:soldAmount,
    reentryRatio:kind==='reentry'&&soldAmount?net/soldAmount*100:null,
    sellRatio:kind==='exit'&&previous?.total?-net/previous.total*100:null,
    fiveDayNet,trail:dates.slice(Math.max(0,index-9),index+1).map((date,n)=>({date,net:values[Math.max(0,index-9)+n]??null})),newStreak:kind==='buying'&&current.exact&&current.days===criteria.minimumDays}};
}

export function buildFlowWatchReport(sessions:InvestorHistorySession[],month:string,selectedDate:string|undefined,investor:StockInvestor,market:RankingMarket,criteria:FlowWatchCriteria,today:string,additionalHolidays:string[]=[]):FlowWatchReport{
  if(!validFlowMonth(month)||!validFlowCriteria(criteria)||(selectedDate&&(stockDate(selectedDate)!==selectedDate||!selectedDate.startsWith(month))))throw Error('수급 추적 조회 기준을 확인해 주세요.');
  const start=shift(month+'-01',-75),end=flowMonthEnd(month),until=end<today?end:today;
  const byDay=new Map(sessions.filter(s=>stockDate(s.date)===s.date&&s.date>=start&&s.date<=until).map(s=>[s.date,s]));
  const observed=new Set([...byDay.values()].flatMap(s=>s.calendar).filter(d=>stockDate(d)===d&&d>=start&&d<=until));
  const calendar:string[]=[];
  for(let date=start;date<=until;date=shift(date,1))if(observed.has(date)||byDay.has(date)||!marketClosedReason(date,additionalHolidays))calendar.push(date);
  const series=new Map<string,(number|null)[]>(),metadata=new Map<string,Map<string,RankingStock>>();
  for(const [date,session] of byDay){
    const index=calendar.indexOf(date);if(index<0)continue;const stocks=new Map<string,RankingStock>();
    for(const [code,name,stockMarket,net] of session.rows){
      if(!/^\d{6}$/.test(code)||typeof name!=='string'||!['kospi','kosdaq'].includes(stockMarket)||(market!=='all'&&market!==stockMarket))continue;
      const values=series.get(code)??new Array<number|null>(calendar.length).fill(null);values[index]=finite(net)?net:null;series.set(code,values);stocks.set(code,{code,name,market:stockMarket});
    }
    metadata.set(date,stocks);
  }
  const available=[...byDay.keys()].filter(d=>d.startsWith(month)).sort();
  const chosen=selectedDate&&selectedDate.startsWith(month)?selectedDate:available.at(-1)??(month===today.slice(0,7)?today:end);
  const days:FlowDaySummary[]=[],events:FlowWatchEvent[]=[];
  for(let date=month+'-01';date<=end;date=shift(date,1)){
    const session=byDay.get(date),stocks=metadata.get(date),index=calendar.indexOf(date),closed=!session&&!observed.has(date)?marketClosedReason(date,additionalHolidays):null;
    const day:FlowDaySummary={date,status:date>today?'future':closed?'closed':session?'ready':'uncollected',reason:closed,expected:stocks?.size??0,covered:0,undetermined:0,counts:zeroCounts(),backfilled:!!session&&session.universe_date>date,observedAt:session?.observed_at??null};
    if(session&&stocks&&index>=0){
      for(const stock of stocks.values()){
        const values=series.get(stock.code)!;if(finite(values[index]))day.covered++;
        const result=inspectFlowSeries(stock,calendar,values,index,criteria);
        if(result.undetermined)day.undetermined++;
        if(result.event){day.counts[result.event.kind]++;if(date===chosen)events.push(result.event);}
      }
      if(!day.expected||day.covered<day.expected||day.undetermined>0)day.status='partial';
    }
    days.push(day);
  }
  events.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)||a.code.localeCompare(b.code));
  return {ok:true,month,selectedDate:chosen,investor,market,criteria,days,selected:days.find(day=>day.date===chosen)!,events,
    historyStart:[...byDay.keys()].sort()[0]??null,historyEnd:[...byDay.keys()].sort().at(-1)??null,warnings:[
      'TOP30 포함 여부와 관계없이 저장된 대상 종목 전체의 일별 순매수 금액으로 판정합니다. 기관 합계와 하위 주체는 중복되므로 합산하지 않습니다.',
      '순매수 0원은 중립 중단입니다. 순매도 이탈로 분류하지 않습니다. 미수집·미제공 거래일은 건너뛰지 않고 판단을 보류합니다.',
      '소급조회 날짜는 조회 당시 종목 목록을 기준으로 복원했습니다. 당시 전체 상장 종목을 완전히 재현한 백테스트가 아닙니다. 원천 자료 정정으로 과거 표시가 바뀔 수 있습니다.',
      '재매수는 수급 재개 신호입니다. 주가 반등 여부는 종목 차트에서 별도로 확인하세요. 비율은 순매수·순매도 금액의 비교이며 실제 보유분 매도율이 아닙니다.'
    ]};
}

export function flowWatchCSV(report:FlowWatchReport,kind:FlowWatchKind,rows=report.events.filter(e=>e.kind===kind)){
  const safe=(v:unknown)=>{const text=String(v??'');return '"'+(typeof v==='string'&&/^[=+\-@\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';};
  const header=['기준일','투자주체','조회시장','분류','종목코드','종목명','시장','당일 순매수(억원)','현재 연속일','현재 연속일 정확여부','현재 연속 순매수 합계(억원)','이전 연속일','이전 연속일 정확여부','이전 연속 순매수 합계(억원)','이탈일','이탈~재매수 거래일','매도구간 순매도 규모(억원)','이탈비율(%)','재매수비율(%)','최근 5거래일 순매수(억원)','연속일 기준','재매수 기간 기준','당일 절댓값 최소(억원)'];
  return '\uFEFF'+[header,...rows.map(r=>[r.date,investorLabel(report.investor),rankingMarketLabels[report.market],flowWatchLabels[r.kind],"'"+r.code,r.name,r.market,r.net,r.run.days,r.run.exact,r.run.total,r.previousRun?.days,r.previousRun?.exact,r.previousRun?.total,r.exitDate,r.gapDays,r.soldAmount,r.sellRatio,r.reentryRatio,r.fiveDayNet,report.criteria.minimumDays,report.criteria.reentryWindow,report.criteria.minimumAmount])].map(row=>row.map(safe).join(',')).join('\r\n');
}

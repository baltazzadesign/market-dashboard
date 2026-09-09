import { CLOSE_MINUTE, OPEN_MINUTE, kstParts, type MarketRow, type MarketEvent } from './balta-model';
import { marketClosedReason } from './market-calendar';
export function collectionHealth(rows: MarketRow[], date: string, now: Date) {
  const clock=kstParts(now), closed=marketClosedReason(date);
  const live=date===clock.date && !closed && clock.minute>=OPEN_MINUTE && clock.minute<=CLOSE_MINUTE;
  const end=date<clock.date?CLOSE_MINUTE:date===clock.date?Math.min(CLOSE_MINUTE,clock.minute-1):OPEN_MINUTE-1;
  const minutes=new Set(rows.filter(r=>r.date===date).map(r=>r.minute));
  const gaps: {start:number;end:number}[]=[];
  if(!closed) for(let m=OPEN_MINUTE;m<=end;m++) if(!minutes.has(m)) {
    const previous=gaps.at(-1);if(previous&&previous.end===m-1)previous.end=m;else gaps.push({start:m,end:m});
  }
  const last=rows.filter(r=>r.date===date).at(-1);
  const delay=live?Math.max(0,clock.minute-(last?.minute??OPEN_MINUTE)):null;
  return {live,closed,last,delay,gaps,missing:gaps.reduce((s,g)=>s+g.end-g.start+1,0),stale:live&&(delay??0)>=3};
}
const validFlow=(r:MarketRow)=>r.flowSource==='LIVE';
export function detectChanges(rows: MarketRow[]) {
  const changes:{time:string;minute:number;label:string;detail:string}[]=[];
  for(let i=1;i<rows.length;i++) {
    const a=rows[i-1],b=rows[i];
    if(a.date!==b.date||b.minute-a.minute!==1)continue;
    if(validFlow(a)&&validFlow(b)) for(const [key,label] of [['foreignFlow','외국인'],['instFlow','기관'],['indivFlow','개인']] as const) {
      const x=a[key],y=b[key];if(x===null||y===null)continue;
      if(x<=0&&y>0||x>=0&&y<0)changes.push({time:b.time,minute:b.minute,label:label+' 순'+(y>0?'매수':'매도')+' 전환',detail:'당일 누적 순매수 0선 통과 · '+y.toLocaleString('ko-KR')+'억원'});
    }
  }
  return changes.reverse();
}
export function recentDivergence(rows:MarketRow[]) {
  const last=rows.at(-1);if(!last)return null;
  const before=rows.find(r=>r.date===last.date&&r.minute===last.minute-30);
  const segment=rows.filter(r=>r.date===last.date&&r.minute>=last.minute-30);
  if(!before||segment.length!==31||segment.some(r=>r.breadthSource!=='LIVE'))return null;
  const change=before.kospi&&last.kospi?(last.kospi/before.kospi-1)*100:null;
  const breadth=last.diff-before.diff;
  const flow=(key:'foreignFlow'|'instFlow'|'indivFlow')=>segment.every(validFlow)&&before[key]!==null&&last[key]!==null?last[key]!-before[key]!:null;
  return {change,breadth,foreign:flow('foreignFlow'),inst:flow('instFlow'),indiv:flow('indivFlow'),divergent:change!==null&&Math.abs(change)>=0.1&&(change>0&&breadth<0||change<0&&breadth>0)};
}
export function signalPerformance(rows:MarketRow[],events:MarketEvent[],market:'kospi'|'kosdaq',horizon:30|60|'close') {
  const byTime=new Map(rows.map(r=>[r.date+' '+r.minute,r]));
  const groups=new Map<string,{label:string;count:number;pending:number;wins:number;sum:number}>();
  const seen=new Set<string>();
  for(const e of [...events].sort((a,b)=>a.minute-b.minute)) {
    // Only persisted directional signals, never hindsight-derived chart events.
    if(e.source!=='수집 신호'||e.direction==='neutral')continue;
    const key=e.date+' '+e.minute+' '+e.type;if(seen.has(key))continue;seen.add(key);
    const g=groups.get(e.type)??{label:e.label,count:0,pending:0,wins:0,sum:0};groups.set(e.type,g);
    const start=byTime.get(e.date+' '+e.minute)?.[market];
    const target=horizon==='close'?CLOSE_MINUTE:e.minute+horizon;
    const end=target>e.minute&&target<=CLOSE_MINUTE?byTime.get(e.date+' '+target)?.[market]:null;
    if(!start||!end){g.pending++;continue;}
    const ret=(end/start-1)*100;g.count++;g.sum+=ret;
    if(e.direction==='up'?ret>0:ret<0)g.wins++;
  }
  return Array.from(groups.values());
}

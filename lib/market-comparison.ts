import { type MarketRow, type MarketEvent, formatNumber as f } from './balta-model';
export const comparisonMetrics = [['foreignFlow','외국인','억원'],['instFlow','기관','억원'],['indivFlow','개인','억원'],['diff','시장폭','종목']] as const;
export function compareAtTime(current:MarketRow,history:MarketRow[]) {
  return comparisonMetrics.map(([key,label,unit])=>{
    const valid=(r:MarketRow)=>key==='diff'?r.breadthSource==='LIVE':r.flowSource==='LIVE';
    const values=history.filter(r=>r.date<current.date&&r.minute===current.minute&&valid(r)).map(r=>r[key]).filter((n):n is number=>n!==null&&Number.isFinite(n));
    const value=valid(current)?current[key]:null;
    const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    return {key,label,unit,value,count:values.length,mean,delta:value!==null&&mean!==null?value-mean:null};
  });
}
export function closingReport(rows:MarketRow[],events:MarketEvent[],date:string) {
  const day=rows.filter(r=>r.date===date).sort((a,b)=>a.minute-b.minute),first=day[0],last=day.at(-1);
  const complete=last?.minute===930;
  const change=(key:'kospi'|'kosdaq')=>first?.[key]&&last?.[key]?(last[key]!/first[key]!-1)*100:null;
  const signals=events.filter(e=>e.date===date&&e.source==='수집 신호');
  const lines=[`# ${date} ${complete?'장 마감':'장중 / 미완료'} 리포트`, '',
    `관측 구간: ${first?.time??'없음'} ~ ${last?.time??'없음'} / ${day.length}개 기록`,
    `KOSPI: ${f(last?.kospi,2)} / 첫 관측 대비 ${f(change('kospi'),2,true)}%`,
    `KOSDAQ: ${f(last?.kosdaq,2)} / 첫 관측 대비 ${f(change('kosdaq'),2,true)}%`,
    `시장폭: ${last?.breadthSource==='LIVE'?f(last.diff,0,true):'확인 불가'}종목`,
    `상승 / 하락: ${last?.breadthSource==='LIVE'?f(last.up)+' / '+f(last.down):'확인 불가'}`,
    ...comparisonMetrics.slice(0,3).map(([key,label])=>`${label} 당일 누적 순매수: ${last?.flowSource==='LIVE'?f(last[key],0,true):'확인 불가'}억원`),
    '',`## 수집 신호 ${signals.length}건`,...signals.slice(0,10).map(e=>`- ${e.time} ${e.label}`), '',
    '지수 변화는 첫 저장 가격 대비이며 전일 대비 수익률이 아닙니다. 수급은 마지막 누적값이며 분별 값을 합산하지 않습니다.',
    complete?'15:30 저장 기록을 기준으로 작성했습니다. 거래소 확정 종가 인증을 의미하지 않습니다.':'15:30 기록이 없어 마감 리포트가 확정되지 않았습니다.',
    '저장 기록으로 다시 생성되며 기록 정정 시 내용도 달라집니다.'];
  return {complete,text:lines.join('\n')};
}

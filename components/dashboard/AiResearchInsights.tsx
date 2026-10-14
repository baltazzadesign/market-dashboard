"use client";

import { useMemo } from 'react';
import { researchHealth } from '@/lib/balta-ai-health';
import { classifyFrozenSignal,regimeLabels,regimeStrategyRows,regimeTypes } from '@/lib/balta-ai-regime';
import type { AiHorizon,AiResearchPayload } from '@/lib/balta-ai-dashboard';
import styles from './AiResearchInsights.module.css';

const labels:Record<string,string>={
 FLOW_V1:'동반 순매수',FLOW_ACCEL_V1:'순매수 가속',
 FLOW_PERSIST_V1:'5일 수급 지속',FLOW_LIQUID_V1:'거래대금 보정'
};
const ratio=(v:number|null)=>v===null?'—':(v>0?'+':'')+v.toFixed(2)+'%p';
export default function AiResearchInsights({data,horizon}:{data:AiResearchPayload;horizon:AiHorizon}){
 const health=useMemo(()=>researchHealth({
  signals:data.signals,runs:data.runs,outcomes:data.outcomes,benchmarks:data.benchmarks,
  nowIso:data.serverNow,holidays:data.additionalHolidays
 }),[data]);
 const regimeRows=useMemo(()=>regimeStrategyRows(data.signals,data.outcomes,data.benchmarks,horizon),[data,horizon]);
 const evidence=useMemo(()=>{
  const rows=new Map<string,ReturnType<typeof classifyFrozenSignal>>();
  for(const s of data.signals)if(!rows.has(s.trade_date))rows.set(s.trade_date,classifyFrozenSignal(s));
  return [...rows.values()];
 },[data.signals]);
 const reliable=evidence.filter(x=>x.regime!=='unknown').length;
 return <>
  <section className={styles.section} aria-label="AI 연구 자동 수집 상태">
   <div className={styles.head}>
    <div><span className={styles.eyebrow}>RESEARCH OPERATIONS</span><h2>자동 수집 상태 진단</h2></div>
    <span className={styles.subtle}>대상 거래일 {health.latestTradingDate} · 서버 기준 조회</span>
   </div>
   <div className={styles.healthGrid}>
    {[health.morning,health.close].map((v)=>
     <div key={v.phase} className={styles.healthCard}>
      <div className={styles.healthTop}><strong>{v.phase==='morning'?'오전 후보 선정':'오후 성과 검증'}</strong>
       <span className={styles[v.state]}>{v.label}</span></div>
      <p>{v.detail}</p>
      <small>{v.latestRun?'마지막 기록 '+new Date(v.latestRun).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):
       'DB 실행 기록 없음'} · 판정 기준 {v.expectedAfterKst} KST</small>
     </div>)}
   </div>
   <div className={styles.healthMetrics}>
    <span>전략 기록 <strong>{health.signals}건</strong></span>
    <span>선정 후보 <strong>{health.candidates}건</strong></span>
    <span>당일 성과 기록 <strong>{health.zeroDayMarks}건</strong></span>
    <span>시장 지수 성과 <strong>{health.benchmarks}건</strong></span>
   </div>
   <p className={styles.note}>실행 기록은 DB에 저장된 결과만 반영합니다. 첫 실행 이전·마감 평가 이전·휴장일은 장애로 판단하지 않습니다. 성과 건수는 완료 여부 판정이 아닌 기록량입니다.</p>
  </section>
  <section className={styles.section} aria-label="시장 상태별 수급전략 검증">
   <div className={styles.head}>
    <div><span className={styles.eyebrow}>FROZEN MARKET CONTEXT</span><h2>시장 상태별 전략 성과</h2>
     <p>후보 선정 이전 거래일의 15:30 관측값 기준 · 실제 시장 초과수익과 교차 검증</p></div>
    <span className={styles.subtle}>분류 가능 {reliable}/{evidence.length}거래일 · 보유기간 {horizon}거래일</span>
   </div>
   <div className={styles.regimeGrid}>
    {regimeTypes.map(regime=>{
     const rows=regimeRows.filter(r=>r.regime===regime);
     const days=evidence.filter(x=>x.regime===regime).length;
     return <div key={regime} className={styles.regimeCard}>
      <div className={styles.regimeTop}><strong>{regimeLabels[regime]}</strong><span>{days}거래일</span></div>
      <table className={styles.table}><thead><tr><th>전략</th><th>매칭 표본</th><th>평균 초과수익</th></tr></thead><tbody>
       {rows.map(r=><tr key={r.strategy}>
        <td>{labels[r.strategy]}</td><td>{r.observations}건 <small>/{r.matchedDays}일</small></td>
        <td><strong className={r.state==='descriptive'?r.meanExcess!==null&&r.meanExcess>0?styles.plus:styles.minus:styles.muted}>
         {r.state==='descriptive'?ratio(r.meanExcess):'—'}</strong>
         <small>{r.state==='unavailable'?'미검증':r.state==='low_sample'?'표본 부족':'관측값'}</small></td>
       </tr>)}
      </tbody></table>
     </div>;
    })}
   </div>
   <p className={styles.note}>상승/하락: KOSPI·KOSDAQ이 각각 ±0.5% 이상 같은 방향이고 시장폭 비율도 53% 이상/47% 이하인 경우. 횡보: 두 지수 변동률 절댓값 0.5% 이하, 상승 종목 비율 43~57%. 그 외는 판정 유보입니다. 전 거래일의 관측 자료가 선정 시점에 고정된 경우만 판정하며, 미래 실적은 분류에 사용하지 않습니다.</p>
   <p className={styles.note}>평균 초과수익은 동일 진입·청산 날짜의 종목-시장 수익률 차이입니다. 최소 30건 및 서로 다른 10거래일 이상인 경우에만 수치를 보여줍니다. 종목 수와 날짜가 겹치므로 전략 간 유의성·수익 우위는 증명되지 않았으며, 비용·세금·슬리피지는 미반영입니다.</p>
  </section>
 </>;
}
